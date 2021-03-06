const Product = require('../models/product')
const Order = require('../models/order')
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const stripe = require('stripe')('sk_test_dttTXXA5zRRbrX4ME0Ypj8at00TrDdvvl1');


const ITEMS_PER_PAGE = 2


exports.getProduct = (req, res, next) => {
    const prodId = req.params.productId
    Product.findById(prodId)
        .then(product => {
            res.render('shop/product-detail', {
                product: product,
                pageTitle: product.title,
                path: '/products',
                isAuthenticated: req.session.isLoggedIn
            })
        })
        .catch(err => console.log(err))
}

exports.getProducts = (req, res, next) => {
    const page = +req.query.page || 1
    let totalItems
    Product.find().countDocuments().then(num => {
            totalItems = num
            return Product.find()
        })
        .then(products => {
            res.render('shop/product-list', {
                prods: products,
                pageTitle: 'All Products',
                path: '/products',
                isAuthenticated: req.session.isLoggedIn,
                currentPage: page,
                nextPage: page + 1,
                hasNextPage: ITEMS_PER_PAGE * page < totalItems,
                hasPreviousPage: page > 1,
                previousPage: page - 1,
                lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
            })
        })
        .catch(err => {
            console.log(err)
        })
}

exports.getIndex = (req, res, next) => {
    const page = +req.query.page
    let totalItems
    Product.find().countDocuments().then(num => {
            totalItems = num
            return Product.find()
                .skip((page - 1) * ITEMS_PER_PAGE)
                .limit(ITEMS_PER_PAGE)
        })
        .then(products => {
            res.render('shop/index', {
                prods: products,
                pageTitle: 'Shop',
                path: '/',
                isAuthenticated: req.session.isLoggedIn,
                currentPage: page,
                nextPage: page + 1,
                hasNextPage: ITEMS_PER_PAGE * page < totalItems,
                hasPreviousPage: page > 1,
                previousPage: page - 1,
                lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE)
            })
        })
        .catch(err => {
            console.log(err)
        })
}

exports.getCart = (req, res, next) => {
    req.user
        .populate('cart.items.productId')
        .execPopulate()
        .then(user => {
            const products = user.cart.items
            res.render('shop/cart', {
                path: '/cart',
                pageTitle: 'Your Cart',
                products: products,
                isAuthenticated: req.session.isLoggedIn
            })
        })
        .catch(err => console.log(err))
}

exports.postCart = (req, res, next) => {
    const prodId = req.body.productId

    Product.findById(prodId).then(product => {
        req.user.addToCart(product)
        return res.redirect('/cart')
    })
}

exports.postCartDeleteProduct = (req, res, next) => {
    const prodId = req.body.productId
    console.log(prodId)
    req.user.removeFromCart(prodId)
    return res.redirect('/cart')
}

exports.postOrder = (req, res, next) => {
    const token = req.body.stripeToken
    let totalSum = 0
    req.user
        .populate('cart.items.productId')
        .execPopulate()
        .then(user => {

            user.cart.items.forEach(prod => {
                totalSum += prod.quantity * prod.productId.price
            })
            const products = user.cart.items.map(item => {
                return { quantity: item.quantity, product: {...item.productId._doc } }
            })
            const order = new Order({
                user: {
                    email: req.user.email,
                    userId: req.user._id
                },
                products: products
            })
            return order.save()
                .then(result => {
                    const charge = stripe.charges.create({
                        amount: totalSum,
                        currency: 'inr',
                        description: 'Demo Order',
                        source: token,
                        metadata: { order_id: result._id.toString() }
                    });

                    return req.user.clearCart()
                })
                .catch(err => console.log(err))
                .then(
                    res.redirect('/orders')
                )
        })
}

exports.getOrders = (req, res, next) => {
    Order.find({ 'user.userId': req.user._id })
        .then(orders => {
            res.render('shop/orders', {
                path: '/orders',
                pageTitle: 'Your Orders',
                orders: orders,
                isAuthenticated: req.session.isLoggedIn
            })
        })
        .catch(err => console.log(err))
}

exports.getInvoice = (req, res, next) => {
    const orderId = req.params.orderId
    Order.findById(orderId).then(order => {
            if (!order) {
                return next(new Error('Order not found'))
            }
            if (order.user.userId.toString() !== req.user._id.toString()) {
                return next(new Error('Unauthorized order access'))
            }
            const invoiceName = 'invoice-' + orderId + '.pdf'
            const invoicePath = path.join('data', 'invoices', invoiceName)
            const pdfDoc = new PDFDocument()

            pdfDoc.pipe(fs.createWriteStream(invoicePath))
            pdfDoc.pipe(res)

            pdfDoc.fontSize('22').text('Invoice', { underline: true })
            pdfDoc.text('----------------------------------------------------------')
            let totalPrice = 0
            order.products.forEach(prod => {
                totalPrice += prod.quantity * prod.product.price
                pdfDoc.fontSize('16').text(prod.product.title + '   -    ' + prod.quantity + '    x   ' + 'INR' + prod.product.price)
            })

            pdfDoc.fontSize('22').text('----------------------------------------------------------')

            pdfDoc.text('Total Price: INR' + totalPrice)

            pdfDoc.end()


            /*fs.readFile(invoicePath, (err, data) => {
              if(err){
                return next(err)
              }
              res.setHeader('Content-Type', 'application/pdf')
              res.setHeader('Content-Disposition', 'attachment; filename="'+invoiceName+'"')
              res.send(data)
            })*/
            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Disposition', 'attachment; filename="' + invoiceName + '"')
        })
        .catch(err => console.log(err))
}

exports.getCheckout = (req, res, next) => {
    req.user
        .populate('cart.items.productId')
        .execPopulate()
        .then(user => {
            const products = user.cart.items
            let total = 0
            products.forEach(prod => {
                total += prod.quantity * prod.productId.price
            })
            res.render('shop/checkout', {
                path: '/checkout',
                pageTitle: 'Checkout',
                products: products,
                isAuthenticated: req.session.isLoggedIn,
                totalSum: total
            })
        })
        .catch(err => console.log(err))
}