import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { orderAPI, productAPI } from '../../services/api';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const OrderForm = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    notes: '',
  });
  const [orderItems, setOrderItems] = useState([
    { productId: '', quantity: 1, product: null },
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await productAPI.getAll({ status: 'ACTIVE' });
      setProducts(response.data.data);
    } catch (error) {
      toast.error('Failed to fetch products');
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...orderItems];
    newItems[index][field] = value;

    if (field === 'productId') {
      const selectedProduct = products.find((p) => p.id === value);
      newItems[index].product = selectedProduct;
    }

    setOrderItems(newItems);
  };

  const addItem = () => {
    setOrderItems([...orderItems, { productId: '', quantity: 1, product: null }]);
  };

  const removeItem = (index) => {
    if (orderItems.length > 1) {
      const newItems = orderItems.filter((_, i) => i !== index);
      setOrderItems(newItems);
    }
  };

  const calculateTotal = () => {
    return orderItems.reduce((total, item) => {
      if (item.product) {
        return total + parseFloat(item.product.unitPrice) * item.quantity;
      }
      return total;
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const validItems = orderItems.filter((item) => item.productId && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one product');
      return;
    }

    setLoading(true);

    try {
      const orderData = {
        ...formData,
        items: validItems.map((item) => ({
          productId: item.productId,
          quantity: parseInt(item.quantity),
        })),
      };

      await orderAPI.create(orderData);
      toast.success('Order created successfully');
      navigate('/orders');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to create order';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/orders')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Orders
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Create New Order</h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* Customer Information */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Customer Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name *
              </label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter customer name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                name="customerPhone"
                value={formData.customerPhone}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+91 9876543210"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email (Optional)
              </label>
              <input
                type="email"
                name="customerEmail"
                value={formData.customerEmail}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="customer@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <input
                type="text"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Any special instructions"
              />
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Order Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-800"
            >
              <Plus className="h-5 w-5" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="space-y-4">
            {orderItems.map((item, index) => (
              <div key={index} className="flex gap-4 items-start">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product *
                  </label>
                  <select
                    value={item.productId}
                    onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} - ₹{product.unitPrice} (Stock: {product.quantity})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    min="1"
                    max={item.product?.quantity || 999}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subtotal
                  </label>
                  <div className="px-4 py-2 bg-gray-100 rounded-lg text-gray-800 font-semibold">
                    ₹
                    {item.product
                      ? (parseFloat(item.product.unitPrice) * item.quantity).toLocaleString()
                      : '0'}
                  </div>
                </div>

                {orderItems.length > 1 && (
                  <div className="pt-8">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex justify-end items-center">
              <span className="text-lg font-semibold text-gray-700 mr-4">Total Amount:</span>
              <span className="text-2xl font-bold text-blue-600">
                ₹{calculateTotal().toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OrderForm;