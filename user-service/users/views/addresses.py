"""Address book endpoints (Bearer, owner-scoped)."""
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from ..errors import ApiError
from ..models import Address
from ..presenters import address_response
from ..responses import ok
from ..serializers import AddressSerializer
from .helpers import parse_uuid_or_none


def _get_owned_address(user, address_id) -> Address:
    parsed = parse_uuid_or_none(address_id)
    if parsed is None:
        raise ApiError("ADDRESS_NOT_FOUND")
    # Owned by another user -> same 404 (no information leak)
    address = Address.objects.filter(id=parsed, user_id=user.id).first()
    if address is None:
        raise ApiError("ADDRESS_NOT_FOUND")
    return address


def _ordered(user):
    return Address.objects.filter(user_id=user.id).order_by(
        "-is_default", "-created_at"
    )


class AddressesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return ok(
            "Lấy danh sách địa chỉ thành công",
            [address_response(a) for a in _ordered(request.user)],
        )

    def post(self, request):
        serializer = AddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            has_addresses = Address.objects.filter(user_id=request.user.id).exists()
            # First address is ALWAYS default, regardless of the flag
            is_default = True if not has_addresses else data["isDefault"]
            if has_addresses and is_default:
                Address.objects.filter(user_id=request.user.id).update(
                    is_default=False
                )
            address = Address.objects.create(
                user=request.user,
                receiver_name=data["receiverName"],
                receiver_phone=data["receiverPhone"],
                address=data["address"],
                is_default=is_default,
            )

        # Original quirk: POST returns 200, not 201.
        return ok("Thêm địa chỉ thành công", address_response(address), status=200)


class AddressDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, address_id):
        address = _get_owned_address(request.user, address_id)
        serializer = AddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            address.receiver_name = data["receiverName"]
            address.receiver_phone = data["receiverPhone"]
            address.address = data["address"]
            if data["isDefault"] and not address.is_default:
                Address.objects.filter(user_id=request.user.id).exclude(
                    id=address.id
                ).update(is_default=False)
                address.is_default = True
            # A default address cannot be demoted by editing itself:
            # isDefault=false on the current default is ignored.
            address.save()

        return ok("Cập nhật địa chỉ thành công", address_response(address))

    def delete(self, request, address_id):
        address = _get_owned_address(request.user, address_id)
        with transaction.atomic():
            was_default = address.is_default
            address.delete()
            if was_default:
                successor = _ordered(request.user).first()
                if successor is not None:
                    successor.is_default = True
                    successor.save(update_fields=["is_default", "updated_at"])
        return ok("Xóa địa chỉ thành công", None)
