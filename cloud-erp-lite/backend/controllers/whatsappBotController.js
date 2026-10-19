.status(400).send('Bad Request');
    }

    const userPhone = From.replace('whatsapp:', '');
    const message = Body.trim();
    const userName = ProfileName || 'User';

    console.log(`📱 Message from ${userName} (${userPhone}): "${message}"`);

    // Process the message
    let response = await processMessage(userPhone, message, userName);

    console.log(`🤖 Sending response: "${response.substring(0, 100)}..."`);

    // Send response
    await sendWhatsAppMessage(userPhone, response);

    // Log to database
    try {
      await prisma.whatsAppLog.create({
        data: {
          userPhone,
          messageType: 'incoming',
          content: message,
          response: response,
          status: 'sent'
        }
      });
    } catch (dbError) {
      console.error('Failed to log to database:', dbError);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    res.status(500).send('Error');
  }
};

// Process incoming messages
async function processMessage(userPhone, message, userName) {
  const command = message.toUpperCase().trim();

  console.log(`Processing command: "${command}"`);

  // Find user in database
  let user = null;
  try {
    user = await prisma.user.findFirst({
      where: { phone: userPhone },
      include: { employee: true }
    });
    console.log(`User found:`, user ? user.name : 'Not found');
  } catch (error) {
    console.error('Error finding user:', error);
  }

  // HELP command
  if (command === 'HELP' || command === 'MENU' || command === 'START') {
    return getHelpMessage(user);
  }

  // Welcome for new users
  if (!user) {
    return `👋 Welcome ${userName}!

I'm your Cloud ERP Lite assistant.

⚠️ Your phone number (${userPhone}) is not registered in our system.

Please contact your administrator to register your account.

Once registered, type *HELP* to see available commands.`;
  }

  // CHECK STOCK
  if (command === 'CHECK STOCK' || command === 'STOCK') {
    return await handleCheckStock(null);
  }

  if (command.startsWith('CHECK STOCK ') || command.startsWith('STOCK ')) {
    const productName = command.replace(/CHECK STOCK |STOCK /gi, '').trim();
    return await handleCheckStock(productName);
  }

  // LOW STOCK
  if (command === 'LOW STOCK' || command === 'LOWSTOCK') {
    return await handleLowStock();
  }

  // MY ORDERS
  if (command === 'MY ORDERS' || command === 'ORDERS') {
    return await handleMyOrders();
  }

  // ORDER STATUS
  if (command.startsWith('ORDER STATUS ')) {
    const orderNumber = command.replace('ORDER STATUS ', '').trim();
    return await handleOrderStatus(orderNumber);
  }

  // MY LEAVES
  if (command === 'MY LEAVES' || command === 'LEAVES') {
    return await handleMyLeaves(user);
  }

  // DASHBOARD
  if (command === 'DASHBOARD' || command === 'STATS') {
    return await handleDashboard(user);
  }

  // TODAY
  if (command === 'TODAY') {
    return await handleToday(user);
  }

  // CREATE ORDER
  if (command === 'CREATE ORDER' || command === 'NEW ORDER') {
    return `🛒 *Create New Order*

To create an order, please use the web dashboard:
${process.env.CLIENT_URL || 'http://localhost:3000'}/orders/create

Or contact your sales team for assistance.

💡 Coming soon: Interactive order creation via WhatsApp!`;
  }

  // APPLY LEAVE
  if (command === 'APPLY LEAVE' || command === 'NEW LEAVE') {
    return `🏖️ *Apply for Leave*

To apply for leave, please use the web dashboard:
${process.env.CLIENT_URL || 'http://localhost:3000'}/leaves

Or contact your HR department.

💡 Coming soon: Interactive leave application via WhatsApp!`;
  }

  // SALES REPORT
  if (command.startsWith('SALES REPORT')) {
    return await handleSalesReport(user, command);
  }

  // Default response
  return `❓ I didn't understand: "${message}"

Type *HELP* to see available commands.`;
}

// Get help message
function getHelpMessage(user) {
  const isManager = user && ['ADMIN', 'MANAGER'].includes(user.role);
  
  return `📋 *Cloud ERP Lite Commands*

📦 *INVENTORY*
- *CHECK STOCK* - View all products
- *CHECK STOCK [name]* - Specific product
- *LOW STOCK* - Low stock items

🛒 *ORDERS*
- *MY ORDERS* - View recent orders
- *ORDER STATUS [id]* - Order details
- *CREATE ORDER* - New order (web)

👥 *HR*
- *MY LEAVES* - Your leave requests
- *APPLY LEAVE* - Apply (web)

${isManager ? `📊 *MANAGER*
- *DASHBOARD* - Key metrics
- *TODAY* - Today's summary
- *SALES REPORT [date]* - Sales data
` : ''}
💡 Commands are NOT case-sensitive

🌐 *Web Dashboard:*
${process.env.CLIENT_URL || 'http://localhost:3000'}

Need help? Contact your administrator.`;
}

// Check stock
async function handleCheckStock(productName) {
  try {
    if (!productName) {
      // Show all products
      const products = await prisma.product.findMany({
        where: { status: 'ACTIVE' },
        take: 10,
        orderBy: { name: 'asc' }
      });

      if (products.length === 0) {
        return '📦 No products found in inventory.';
      }

      let response = '📦 *Current Inventory* (Top 10)\n\n';
      products.forEach((p, i) => {
        const stockStatus = p.quantity <= p.reorderLevel ? '⚠️' : '✅';
        response += `${i + 1}. *${p.name}*\n`;
        response += `   Stock: ${p.quantity} units ${stockStatus}\n`;
        response += `   Price: ₹${parseFloat(p.unitPrice).toLocaleString()}\n\n`;
      });
      
      response += `💡 Type *CHECK STOCK [product name]* for details`;
      return response;
    }

    // Search specific product
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: productName, mode: 'insensitive' } },
          { sku: { contains: productName, mode: 'insensitive' } }
        ],
        status: 'ACTIVE'
      },
      take: 5
    });

    if (products.length === 0) {
      return `❌ Product "${productName}" not found.

Type *CHECK STOCK* to see all products.`;
    }

    if (products.length === 1) {
      const p = products[0];
      const stockStatus = p.quantity <= p.reorderLevel ? '⚠️ LOW STOCK' : '✅ In Stock';
      
      return `📦 *${p.name}*

SKU: ${p.sku}
Stock: *${p.quantity}* units ${stockStatus}
Reorder Level: ${p.reorderLevel}
Price: ₹${parseFloat(p.unitPrice).toLocaleString()}
Category: ${p.category || 'N/A'}

${p.quantity <= p.reorderLevel ? '⚠️ Action needed: Stock below reorder level!' : ''}`;
    }

    // Multiple matches
    let response = `🔍 Found ${products.length} products matching "${productName}":\n\n`;
    products.forEach((p, i) => {
      const stockStatus = p.quantity <= p.reorderLevel ? '⚠️' : '✅';
      response += `${i + 1}. *${p.name}* ${stockStatus}\n`;
      response += `   Stock: ${p.quantity} units\n`;
      response += `   Price: ₹${parseFloat(p.unitPrice).toLocaleString()}\n\n`;
    });
    
    return response;

  } catch (error) {
    console.error('Check stock error:', error);
    return '❌ Error checking stock. Please try again or contact support.';
  }
}

// Low stock
async function handleLowStock() {
  try {
    const products = await prisma.product.findMany({
      where: {
        status: 'ACTIVE'
      },
      orderBy: { quantity: 'asc' }
    });

    // Filter low stock items
    const lowStockItems = products.filter(p => p.quantity <= p.reorderLevel);

    if (lowStockItems.length === 0) {
      return '✅ *All products are well-stocked!*\n\nNo items below reorder level.';
    }

    let response = `⚠️ *LOW STOCK ALERT*\n${lowStockItems.length} items need attention:\n\n`;
    
    lowStockItems.slice(0, 15).forEach((p, i) => {
      const shortage = p.reorderLevel - p.quantity;
      response += `${i + 1}. *${p.name}*\n`;
      response += `   Current: ${p.quantity} | Need: ${p.reorderLevel}\n`;
      response += `   Shortage: ${shortage} units\n\n`;
    });

    if (lowStockItems.length > 15) {
      response += `...and ${lowStockItems.length - 15} more items\n\n`;
    }

    return response;

  } catch (error) {
    console.error('Low stock error:', error);
    return '❌ Error fetching low stock items.';
  }
}

// My orders
async function handleMyOrders() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (orders.length === 0) {
      return '📦 *No orders found*\n\nCreate your first order on the web dashboard!';
    }

    let response = '📦 *Recent Orders*\n\n';
    
    orders.forEach((order, i) => {
      const statusEmoji = {
        'PENDING': '⏳',
        'PROCESSING': '🔄',
        'COMPLETED': '✅',
        'CANCELLED': '❌'
      }[order.status] || '❓';

      response += `${i + 1}. *${order.orderNumber}* ${statusEmoji}\n`;
      response += `   Customer: ${order.customerName}\n`;
      response += `   Amount: ₹${parseFloat(order.totalAmount).toLocaleString()}\n`;
      response += `   Date: ${new Date(order.createdAt).toLocaleDateString()}\n\n`;
    });

    response += `💡 Type *ORDER STATUS [number]* for details`;
    return response;

  } catch (error) {
    console.error('My orders error:', error);
    return '❌ Error fetching orders.';
  }
}

// Order status
async function handleOrderStatus(orderNumber) {
  try {
    const order = await prisma.order.findFirst({
      where: { 
        orderNumber: { contains: orderNumber, mode: 'insensitive' }
      }
    });

    if (!order) {
      return `❌ Order "${orderNumber}" not found.

Type *MY ORDERS* to see all orders.`;
    }

    const statusEmoji = {
      'PENDING': '⏳',
      'PROCESSING': '🔄',
      'COMPLETED': '✅',
      'CANCELLED': '❌'
    }[order.status] || '❓';

    let response = `📦 *Order Details*\n\n`;
    response += `Order #: *${order.orderNumber}*\n`;
    response += `Status: ${order.status} ${statusEmoji}\n`;
    response += `Payment: ${order.paymentStatus}\n\n`;
    
    response += `👤 *Customer*\n`;
    response += `${order.customerName}\n`;
    response += `${order.customerPhone}\n\n`;

    response += `💰 *Total Amount*\n`;
    response += `₹${parseFloat(order.totalAmount).toLocaleString()}\n\n`;

    response += `📅 *Date*\n`;
    response += `${new Date(order.createdAt).toLocaleString()}\n`;

    return response;

  } catch (error) {
    console.error('Order status error:', error);
    return '❌ Error fetching order details.';
  }
}

// My leaves
async function handleMyLeaves(user) {
  if (!user || !user.employee) {
    return '❌ Employee record not found.\n\nContact HR to set up your profile.';
  }

  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: { employeeId: user.employee.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (leaves.length === 0) {
      return '📋 *No leave requests found*\n\nType *APPLY LEAVE* to request leave.';
    }

    let response = '📋 *Your Leave Requests*\n\n';
    
    leaves.forEach((leave, i) => {
      const statusEmoji = {
        'PENDING': '⏳',
        'APPROVED': '✅',
        'REJECTED': '❌'
      }[leave.status] || '❓';

      response += `${i + 1}. ${leave.leaveType} ${statusEmoji}\n`;
      response += `   ${new Date(leave.startDate).toLocaleDateString()} - ${new Date(leave.endDate).toLocaleDateString()}\n`;
      response += `   Status: *${leave.status}*\n\n`;
    });

    return response;

  } catch (error) {
    console.error('My leaves error:', error);
    return '❌ Error fetching leave requests.';
  }
}

// Dashboard
async function handleDashboard(user) {
  if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
    return '🔒 *Access Denied*\n\nOnly managers can view dashboard.';
  }

  try {
    const [totalProducts, lowStock, totalOrders, pendingOrders] = await Promise.all([
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.product.count({
        where: { status: 'ACTIVE' }
      }).then(async () => {
        const products = await prisma.product.findMany({ where: { status: 'ACTIVE' } });
        return products.filter(p => p.quantity <= p.reorderLevel).length;
      }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } })
    ]);

    return `📊 *Dashboard Statistics*

📦 *Inventory*
Total Products: ${totalProducts}
Low Stock: ${lowStock} ${lowStock > 0 ? '⚠️' : '✅'}

🛒 *Orders*
Total: ${totalOrders}
Pending: ${pendingOrders}

🌐 Full dashboard:
${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard`;

  } catch (error) {
    console.error('Dashboard error:', error);
    return '❌ Error fetching dashboard data.';
  }
}

// Today summary
async function handleToday(user) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayOrders = await prisma.order.count({
      where: {
        createdAt: { gte: today, lt: tomorrow }
      }
    });

    return `📅 *Today's Summary*
${new Date().toLocaleDateString()}

🛒 Orders Today: ${todayOrders}

Type *DASHBOARD* for more details`;

  } catch (error) {
    console.error('Today error:', error);
    return '❌ Error fetching today\'s data.';
  }
}

// Sales report
async function handleSalesReport(user, command) {
  if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
    return '🔒 *Access Denied*\n\nOnly managers can view sales reports.';
  }

  return `📊 *Sales Report*

For detailed sales reports, please visit:
${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard

💡 Interactive reports coming soon!`;
}                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                