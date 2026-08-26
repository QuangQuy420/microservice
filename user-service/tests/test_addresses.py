import uuid

import pytest

from .conftest import bearer, register, login

pytestmark = pytest.mark.django_db


def create_address(client, token, **overrides):
    payload = {
        "receiverName": "Nguyen Van A",
        "receiverPhone": "0911222333",
        "address": "1 Tran Hung Dao, Ha Noi",
        "isDefault": False,
    }
    payload.update(overrides)
    return client.post("/api/v1/addresses", payload, **bearer(token))


def list_addresses(client, token):
    return client.get("/api/v1/addresses", **bearer(token))


def test_create_address_returns_200_not_201(client, customer):
    response = create_address(client, customer["token"])
    assert response.status_code == 200  # original quirk: POST -> 200
    data = response.data["data"]
    assert set(data.keys()) == {
        "id",
        "receiverName",
        "receiverPhone",
        "address",
        "isDefault",
        "createdAt",
    }


def test_first_address_is_always_default(client, customer):
    response = create_address(client, customer["token"], isDefault=False)
    assert response.data["data"]["isDefault"] is True


def test_new_default_demotes_others(client, customer):
    first = create_address(client, customer["token"])
    second = create_address(
        client, customer["token"], address="2 Hang Bai", isDefault=True
    )
    assert second.data["data"]["isDefault"] is True

    listing = list_addresses(client, customer["token"]).data["data"]
    by_id = {a["id"]: a for a in listing}
    assert by_id[first.data["data"]["id"]]["isDefault"] is False
    assert by_id[second.data["data"]["id"]]["isDefault"] is True


def test_non_default_second_address_stays_non_default(client, customer):
    create_address(client, customer["token"])
    second = create_address(client, customer["token"], address="2 Hang Bai")
    assert second.data["data"]["isDefault"] is False


def test_list_ordering_default_first_then_newest(client, customer):
    a1 = create_address(client, customer["token"], address="A1")
    a2 = create_address(client, customer["token"], address="A2")
    a3 = create_address(client, customer["token"], address="A3")
    listing = list_addresses(client, customer["token"])
    ids = [a["id"] for a in listing.data["data"]]
    # a1 is default (first created); then newest first
    assert ids == [
        a1.data["data"]["id"],
        a3.data["data"]["id"],
        a2.data["data"]["id"],
    ]


def test_edit_cannot_demote_default(client, customer):
    created = create_address(client, customer["token"])
    address_id = created.data["data"]["id"]
    response = client.put(
        f"/api/v1/addresses/{address_id}",
        {
            "receiverName": "Nguyen Van A",
            "receiverPhone": "0911222333",
            "address": "1 Tran Hung Dao",
            "isDefault": False,  # attempt to demote the default itself
        },
        **bearer(customer["token"]),
    )
    assert response.status_code == 200
    assert response.data["data"]["isDefault"] is True  # NOT demoted


def test_edit_promoting_another_demotes_previous_default(client, customer):
    first = create_address(client, customer["token"])
    second = create_address(client, customer["token"], address="2 Hang Bai")
    response = client.put(
        f"/api/v1/addresses/{second.data['data']['id']}",
        {
            "receiverName": "Nguyen Van A",
            "receiverPhone": "0911222333",
            "address": "2 Hang Bai",
            "isDefault": True,
        },
        **bearer(customer["token"]),
    )
    assert response.data["data"]["isDefault"] is True
    listing = list_addresses(client, customer["token"]).data["data"]
    by_id = {a["id"]: a for a in listing}
    assert by_id[first.data["data"]["id"]]["isDefault"] is False


def test_delete_default_promotes_next(client, customer):
    first = create_address(client, customer["token"], address="A1")
    second = create_address(client, customer["token"], address="A2")
    third = create_address(client, customer["token"], address="A3")

    response = client.delete(
        f"/api/v1/addresses/{first.data['data']['id']}",
        **bearer(customer["token"]),
    )
    assert response.status_code == 200
    assert response.data == {"data": None}

    listing = list_addresses(client, customer["token"]).data["data"]
    assert len(listing) == 2
    # promoted: first of remaining ordered is_default DESC, created_at DESC
    assert listing[0]["id"] == third.data["data"]["id"]
    assert listing[0]["isDefault"] is True
    assert listing[1]["isDefault"] is False


def test_delete_non_default_keeps_default(client, customer):
    first = create_address(client, customer["token"], address="A1")
    second = create_address(client, customer["token"], address="A2")
    client.delete(
        f"/api/v1/addresses/{second.data['data']['id']}",
        **bearer(customer["token"]),
    )
    listing = list_addresses(client, customer["token"]).data["data"]
    assert len(listing) == 1
    assert listing[0]["id"] == first.data["data"]["id"]
    assert listing[0]["isDefault"] is True


def test_address_not_found_for_unknown_and_bad_ids(client, customer):
    for bad_id in (str(uuid.uuid4()), "not-a-uuid"):
        response = client.delete(
            f"/api/v1/addresses/{bad_id}", **bearer(customer["token"])
        )
        assert response.status_code == 404
        assert response.data["error"]["code"] == "ADDRESS_NOT_FOUND"


def test_address_of_other_user_is_404(client, customer):
    created = create_address(client, customer["token"])
    address_id = created.data["data"]["id"]

    register(client, email="other@example.com", username="other_user")
    other_token = login(client, "other_user").data["data"]["accessToken"]

    response = client.delete(
        f"/api/v1/addresses/{address_id}", **bearer(other_token)
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "ADDRESS_NOT_FOUND"


def test_address_validation_and_normalization(client, customer):
    response = create_address(client, customer["token"], receiverPhone="123")
    assert response.status_code == 422
    assert response.data["error"]["code"] == "VALIDATION_ERROR"
    assert "receiverPhone" in response.data["error"]["details"]

    ok = create_address(
        client,
        customer["token"],
        receiverName="  Nguyen   Van  A ",
        address="  1   Tran Hung   Dao ",
    )
    assert ok.data["data"]["receiverName"] == "Nguyen Van A"
    assert ok.data["data"]["address"] == "1 Tran Hung Dao"


def test_addresses_require_token(client, db):
    assert client.get("/api/v1/addresses").status_code == 401
