from __future__ import annotations

import uuid

from tests.conftest import make_image, make_product, make_variant

USER = str(uuid.uuid4())


def _add(client, product, variant, quantity=1):
    return client.post(
        f"/api/v1/carts/{USER}/items",
        json={"productId": product["id"], "variantId": variant["id"], "quantity": quantity},
    )


class TestGetCart:
    def test_empty_cart_returns_200_and_is_not_persisted(self, client, redis_client):
        res = client.get(f"/api/v1/carts/{USER}")
        assert res.status_code == 200
        body = res.json()
        assert body["userId"] == USER
        assert body["items"] == []
        assert body["totalQuantity"] == 0
        assert body["totalAmount"] == 0
        assert redis_client.get(f"cart:{USER}") is None


class TestAddItem:
    def test_add_item_creates_cart_with_snapshot(self, client, product_client, redis_client):
        variant = make_variant(extra_price="20000.00", stock=10)
        product = make_product(base_price="100000.00", variants=[variant])
        product_client.register(product)

        res = _add(client, product, variant, quantity=2)
        assert res.status_code == 201
        body = res.json()
        assert body["totalQuantity"] == 2
        assert body["totalAmount"] == 240000.00
        item = body["items"][0]
        assert item["productId"] == product["id"]
        assert item["variantId"] == variant["id"]
        assert item["productName"] == product["name"]
        assert item["skuVariant"] == variant["skuVariant"]
        assert item["color"] == "Đen"
        assert item["colorHex"] == "#000000"
        assert item["size"] == "52"
        assert item["basePrice"] == 100000.00
        assert item["extraPrice"] == 20000.00
        assert item["unitPrice"] == 120000.00
        assert item["subtotal"] == 240000.00
        # persisted with TTL 7 days
        ttl = redis_client.ttl(f"cart:{USER}")
        assert 0 < ttl <= 7 * 24 * 3600

    def test_add_same_variant_merges_quantities(self, client, product_client):
        variant = make_variant(stock=10)
        product = make_product(variants=[variant])
        product_client.register(product)
        _add(client, product, variant, quantity=2)
        res = _add(client, product, variant, quantity=3)
        assert res.status_code == 201
        assert res.json()["items"][0]["quantity"] == 5
        assert res.json()["totalQuantity"] == 5

    def test_merge_refreshes_snapshot_price(self, client, product_client):
        variant = make_variant(stock=10)
        product = make_product(base_price="100000.00", variants=[variant])
        product_client.register(product)
        _add(client, product, variant, quantity=1)
        # price change between adds → snapshot refreshed
        product["basePrice"] = product["basePrice"] * 2
        res = _add(client, product, variant, quantity=1)
        assert res.json()["items"][0]["unitPrice"] == 200000.00

    def test_product_not_published(self, client, product_client):
        variant = make_variant()
        product = make_product(status="DRAFT", variants=[variant])
        product_client.register(product)
        res = _add(client, product, variant)
        assert res.status_code == 400
        assert res.json()["message"] == "Sản phẩm hiện không được phép đặt mua"

    def test_product_without_price(self, client, product_client):
        variant = make_variant()
        product = make_product(base_price=None, variants=[variant])
        product_client.register(product)
        res = _add(client, product, variant)
        assert res.status_code == 400
        assert res.json()["message"] == "Sản phẩm chưa có giá bán"

    def test_product_negative_price(self, client, product_client):
        variant = make_variant()
        product = make_product(base_price="-1.00", variants=[variant])
        product_client.register(product)
        res = _add(client, product, variant)
        assert res.status_code == 400
        assert res.json()["message"] == "Giá sản phẩm không hợp lệ"

    def test_product_not_found(self, client, product_client):
        product = make_product()
        variant = product["variants"][0]
        res = _add(client, product, variant)  # never registered
        assert res.status_code == 404
        assert res.json()["message"] == f"Không tìm thấy sản phẩm: {product['id']}"

    def test_product_without_variants(self, client, product_client):
        product = make_product(variants=[])
        product_client.register(product)
        res = client.post(
            f"/api/v1/carts/{USER}/items",
            json={"productId": product["id"], "variantId": str(uuid.uuid4()), "quantity": 1},
        )
        assert res.status_code == 404
        assert res.json()["message"] == "Sản phẩm không có biến thể"

    def test_variant_not_found(self, client, product_client):
        product = make_product(variants=[make_variant()])
        product_client.register(product)
        res = client.post(
            f"/api/v1/carts/{USER}/items",
            json={"productId": product["id"], "variantId": str(uuid.uuid4()), "quantity": 1},
        )
        assert res.status_code == 404
        assert res.json()["message"] == "Không tìm thấy biến thể sản phẩm"

    def test_quantity_above_stock(self, client, product_client):
        variant = make_variant(stock=5)
        product = make_product(variants=[variant])
        product_client.register(product)
        res = _add(client, product, variant, quantity=6)
        assert res.status_code == 400
        assert res.json()["message"] == "Chỉ còn 5 sản phẩm trong kho"

    def test_merged_quantity_above_stock(self, client, product_client):
        variant = make_variant(stock=5)
        product = make_product(variants=[variant])
        product_client.register(product)
        _add(client, product, variant, quantity=4)
        res = _add(client, product, variant, quantity=2)
        assert res.status_code == 400
        assert res.json()["message"] == "Chỉ còn 5 sản phẩm trong kho"

    def test_merged_quantity_above_99(self, client, product_client):
        variant = make_variant(stock=200)
        product = make_product(variants=[variant])
        product_client.register(product)
        _add(client, product, variant, quantity=98)
        res = _add(client, product, variant, quantity=2)
        assert res.status_code == 400
        assert res.json()["message"] == "Số lượng sản phẩm phải từ 1 đến 99"

    def test_quantity_zero_fails_validation(self, client, product_client):
        variant = make_variant()
        product = make_product(variants=[variant])
        product_client.register(product)
        res = _add(client, product, variant, quantity=0)
        assert res.status_code == 400
        assert res.json()["message"] == "Dữ liệu gửi lên không hợp lệ"
        assert res.json()["validationErrors"]["quantity"] == "Số lượng sản phẩm phải từ 1 đến 99"


class TestImagePriorityChain:
    """5-step priority: variant thumbnail → variant lowest sortOrder →
    any thumbnail → first image → null."""

    def _image_of_added_item(self, client, product_client, images, variant):
        product = make_product(variants=[variant], images=images)
        product_client.register(product)
        res = _add(client, product, variant)
        assert res.status_code == 201
        return res.json()["items"][0]["productImageUrl"]

    def test_step1_variant_thumbnail_wins(self, client, product_client):
        variant = make_variant()
        other = make_variant()
        images = [
            make_image(other["id"], url="http://img/other-thumb.jpg", thumbnail=True),
            make_image(variant["id"], url="http://img/v-sorted.jpg", sort_order=0),
            make_image(variant["id"], url="http://img/v-thumb.jpg", thumbnail=True, sort_order=5),
        ]
        assert self._image_of_added_item(client, product_client, images, variant) == "http://img/v-thumb.jpg"

    def test_step2_variant_lowest_sort_order(self, client, product_client):
        variant = make_variant()
        images = [
            make_image(variant["id"], url="http://img/v-null.jpg", sort_order=None),
            make_image(variant["id"], url="http://img/v-2.jpg", sort_order=2),
            make_image(variant["id"], url="http://img/v-1.jpg", sort_order=1),
            make_image(None, url="http://img/global-thumb.jpg", thumbnail=True),
        ]
        assert self._image_of_added_item(client, product_client, images, variant) == "http://img/v-1.jpg"

    def test_step2_null_sort_order_sorts_last(self, client, product_client):
        variant = make_variant()
        images = [
            make_image(variant["id"], url="http://img/v-null.jpg", sort_order=None),
            make_image(variant["id"], url="http://img/v-9.jpg", sort_order=9),
        ]
        assert self._image_of_added_item(client, product_client, images, variant) == "http://img/v-9.jpg"

    def test_step3_any_thumbnail(self, client, product_client):
        variant = make_variant()
        other = make_variant()
        images = [
            make_image(other["id"], url="http://img/other-1.jpg"),
            make_image(other["id"], url="http://img/other-thumb.jpg", thumbnail=True),
        ]
        assert self._image_of_added_item(client, product_client, images, variant) == "http://img/other-thumb.jpg"

    def test_step4_first_image(self, client, product_client):
        variant = make_variant()
        other = make_variant()
        images = [
            make_image(other["id"], url="http://img/first.jpg"),
            make_image(other["id"], url="http://img/second.jpg"),
        ]
        assert self._image_of_added_item(client, product_client, images, variant) == "http://img/first.jpg"

    def test_step5_no_images_gives_null(self, client, product_client):
        variant = make_variant()
        assert self._image_of_added_item(client, product_client, [], variant) is None


class TestUpdateItem:
    def test_update_missing_cart(self, client):
        res = client.put(
            f"/api/v1/carts/{USER}/items/{uuid.uuid4()}", json={"quantity": 2}
        )
        assert res.status_code == 404
        assert res.json()["message"] == "Giỏ hàng không tồn tại hoặc đang trống"

    def test_update_variant_not_in_cart(self, client, product_client):
        variant = make_variant()
        product = make_product(variants=[variant])
        product_client.register(product)
        _add(client, product, variant)
        res = client.put(
            f"/api/v1/carts/{USER}/items/{uuid.uuid4()}", json={"quantity": 2}
        )
        assert res.status_code == 404
        assert res.json()["message"] == "Biến thể sản phẩm không tồn tại trong giỏ hàng"

    def test_update_sets_absolute_quantity(self, client, product_client):
        variant = make_variant(stock=10)
        product = make_product(variants=[variant])
        product_client.register(product)
        _add(client, product, variant, quantity=5)
        res = client.put(
            f"/api/v1/carts/{USER}/items/{variant['id']}", json={"quantity": 2}
        )
        assert res.status_code == 200
        assert res.json()["items"][0]["quantity"] == 2

    def test_update_revalidates_stock(self, client, product_client):
        variant = make_variant(stock=3)
        product = make_product(variants=[variant])
        product_client.register(product)
        _add(client, product, variant, quantity=2)
        res = client.put(
            f"/api/v1/carts/{USER}/items/{variant['id']}", json={"quantity": 4}
        )
        assert res.status_code == 400
        assert res.json()["message"] == "Chỉ còn 3 sản phẩm trong kho"

    def test_update_refreshes_snapshot(self, client, product_client):
        variant = make_variant(stock=10)
        product = make_product(base_price="100000.00", variants=[variant])
        product_client.register(product)
        _add(client, product, variant, quantity=1)
        product["basePrice"] = product["basePrice"] + 50000
        res = client.put(
            f"/api/v1/carts/{USER}/items/{variant['id']}", json={"quantity": 1}
        )
        assert res.json()["items"][0]["unitPrice"] == 150000.00


class TestRemoveItem:
    def test_remove_item_keeps_other_items(self, client, product_client):
        v1, v2 = make_variant(), make_variant()
        product = make_product(variants=[v1, v2])
        product_client.register(product)
        _add(client, product, v1)
        _add(client, product, v2)
        res = client.delete(f"/api/v1/carts/{USER}/items/{v1['id']}")
        assert res.status_code == 200
        body = res.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["variantId"] == v2["id"]

    def test_remove_last_item_deletes_redis_key(self, client, product_client, redis_client):
        variant = make_variant()
        product = make_product(variants=[variant])
        product_client.register(product)
        _add(client, product, variant)
        res = client.delete(f"/api/v1/carts/{USER}/items/{variant['id']}")
        assert res.status_code == 200
        assert res.json()["items"] == []
        assert redis_client.get(f"cart:{USER}") is None


class TestClearCart:
    def test_clear_returns_204_no_body(self, client, product_client, redis_client):
        variant = make_variant()
        product = make_product(variants=[variant])
        product_client.register(product)
        _add(client, product, variant)
        res = client.delete(f"/api/v1/carts/{USER}")
        assert res.status_code == 204
        assert res.content == b""
        assert redis_client.get(f"cart:{USER}") is None

    def test_clear_is_idempotent(self, client):
        assert client.delete(f"/api/v1/carts/{USER}").status_code == 204
        assert client.delete(f"/api/v1/carts/{USER}").status_code == 204
