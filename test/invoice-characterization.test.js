'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var coupons = require('../lib/coupons');
var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');

test('invoice GST and total match the order billing calculation', function () {
  var items = [{ id: 1, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 600, qty: 1 }];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var invoiced = invoice.computeInvoiceFigures({ coupon: 'SAVE10', items: items });

  assert.equal(invoiced.tax, billed.tax);
  assert.equal(invoiced.cgst, billed.cgst);
  assert.equal(invoiced.sgst, billed.sgst);
  assert.equal(invoiced.total, billed.total);
  assert.equal(invoiced.rows[0].gstPercent, billed.lines[0].gstPercent);
  assert.equal(invoiced.rows[0].lineTax, billed.lines[0].tax);
  assert.equal(invoiced.rows[0].line, billed.lines[0].gross);
  assert.equal(invoiced.rows[0].taxable, billed.lines[0].taxable);
  var html = invoice.render({ coupon: 'SAVE10', items: items });
  assert.match(html, /Line Gross/);
  assert.match(html, /Taxable Value/);
  assert.match(html, /600\.00/);
  assert.match(html, /540\.00/);
});

test('invoice matches explicit GST rates accepted by order pricing', function () {
  [18, 0.18].forEach(function (gstRate) {
    var items = [{ id: 1, name: 'Item', hsn: '', gstRate: gstRate, price: 100, qty: 1 }];
    var billed = pricing.computeTotals(items, '');
    var invoiced = invoice.computeInvoiceFigures({ items: items });

    assert.equal(invoiced.tax, billed.tax);
    assert.equal(invoiced.total, billed.total);
    assert.equal(invoiced.rows[0].gstPercent, billed.lines[0].gstPercent);
  });
});

// These tests deliberately document existing calculations. They do not read or
// write data/db.json; all inputs are local in-memory objects.
test('order pricing uses HSN slabs for each billed line', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 },
    { id: 2, name: 'Ghee', hsn: '0405', price: 100, qty: 1 }
  ];

  var totals = pricing.computeTotals(items, '');

  assert.equal(totals.subtotal, 200);
  assert.equal(totals.tax, 17);
  assert.equal(totals.cgst, 8.5);
  assert.equal(totals.sgst, 8.5);
  assert.equal(totals.total, 217);
  assert.deepEqual(totals.lines.map(function (line) { return line.gstPercent; }), [5, 12]);
});

test('invoice uses HSN slabs when order lines contain no explicit gstRate', function () {
  var order = {
    items: [
      { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 },
      { id: 2, name: 'Ghee', hsn: '0405', price: 100, qty: 1 }
    ]
  };

  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, 200);
  assert.equal(figures.tax, 17);
  assert.equal(figures.cgst, 8.5);
  assert.equal(figures.sgst, 8.5);
  assert.equal(figures.total, 217);
  assert.deepEqual(figures.rows.map(function (line) { return line.gstPercent; }), [5, 12]);
});

test('invoice coupon and GST amounts match order pricing', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 600, qty: 1 }];
  var billed = pricing.computeTotals(items, 'SAVE10');
  var invoiced = invoice.computeInvoiceFigures({
    coupon: 'SAVE10',
    items: items
  });

  assert.equal(billed.subtotal, 600);
  assert.equal(billed.discount, 60);
  assert.equal(billed.tax, 27);
  assert.equal(billed.total, 567);
  assert.equal(invoiced.tax, billed.tax);
  assert.equal(invoiced.discount, billed.discount);
  assert.equal(invoiced.cgst, billed.cgst);
  assert.equal(invoiced.sgst, billed.sgst);
  assert.equal(invoiced.rows[0].lineTax, billed.lines[0].tax);
  assert.equal(invoiced.rows[0].line, billed.lines[0].gross);
  assert.equal(invoiced.rows[0].taxable, billed.lines[0].taxable);
  assert.equal(invoiced.rows[0].taxable, 540);
  assert.equal(invoiced.total, billed.total);
});

test('invoice ignores an inactive coupon just like order pricing', function () {
  var check = coupons.validate('DIWALI20', 5000);
  var figures = invoice.computeInvoiceFigures({
    coupon: 'DIWALI20',
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 5000, qty: 1 }]
  });

  assert.equal(check.valid, false);
  assert.match(check.error, /expired/);
  assert.equal(figures.discount, 0);
  assert.equal(figures.tax, 250);
  assert.equal(figures.total, 5250);
});
