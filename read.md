===========================Auth / Users================

POST localhost:5000/auth/register

POST localhost:5000/auth/login

================Products==================

GET localhost:5000/products

GET localhost:5000/products/:id

POST localhost:5000/products (Seller/Admin)

PUT localhost:5000/products/:id (Seller/Admin)

DELETE localhost:5000/products/:id (Seller/Admin)

==============Cart=================

GET localhost:5000/cart

POST localhost:5000/cart

PUT localhost:5000/cart/:cartItemId

DELETE localhost:5000/cart/:cartItemId

====================Orders / Payments=========================

POST localhost:5000/orders

GET localhost:5000/orders

GET localhost:5000/orders/:id

POST localhost:5000/payment

=====================Reviews==============================

POST localhost:5000/reviews

GET localhost:5000/reviews/product/:id

GET localhost:5000/reviews/seller

POST localhost:5000/reviews/:reviewId/reply

GET localhost:5000/reviews/me

======================Complaints============================

POST localhost:5000/complaints

GET localhost:5000/complaints/my

GET localhost:5000/complaints/seller

PUT localhost:5000/complaints/reply/:id

PUT localhost:5000/complaints/user-reply/:id

DELETE localhost:5000/complaints/:id

DELETE localhost:5000/complaints/seller/:id

========================Notifications=============================

GET localhost:5000/notifications

PUT localhost:5000/notifications/:id/read