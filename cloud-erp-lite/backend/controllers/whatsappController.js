
    
    orders.forEach((order, i) => {
      const statusEmoji = {
        'PENDING': '⏳',
        'PROCESSING': '🔄',
        'COMPLETED': '✅',
        'CANCELLED': '❌'
      }[order.status];

      response += `${i + 1}. ${order.orderNumber} ${statusEmoji}\n`;
      response += `   Customer: ${order.customerName}\n`;
      response += `   Amount: ₹${parseFloat(order.totalAmount).toLocaleString()}\n`;
      response += `   Status: *${order.status}*\n`;
      response += `   Date: ${new Date(order.createdAt).toLocaleDateString()}\n\n`;
    });

    response += `💡 Type *ORDER STATUS [order-number]* for details`;
    return response;

  } catch (error) {
    console.error('My orders error:', error);
    return `❌ Error fetching orders.`;
  }
};

const handleOrderStatus = async (command) => {
  try {
    // Extract order number: "ORDER STATUS ORD-123456"
    const orderNumber = command.replace(/ORDER STATUS/gi, '').trim();

    if (!orderNumber) {
      return `❌ Please provide order number.\n\nExample: ORDER STATUS ORD-123456`;
    }

    const order = await prisma.order.findFirst({
      where: { 
        orderNumber: { contains: orderNumber, mode: 'insensitive' }
      },
      include: {
        invoice: true
      }
    });

    if (!order) {
      return `❌ Order "${orderNumber}" not found.\n\nType *MY ORDERS* to see all orders.`;
    }

    const statusEmoji = {
      'PENDING': '⏳',
      'PROCESSING': '🔄',
      'COMPLETED': '✅',
      'CANCELLED': '❌'
    }[order.status];

    const paymentEmoji = {
      'UNPAID': '❌',
      'PARTIAL': '⚠️',
      'PAID': '✅'
    }[order.paymentStatus];

    let response = `📦 *Order Details*\n\n`;
    response += `Order #: *${order.orderNumber}*\n`;
    response += `Status: ${order.status} ${statusEmoji}\n`;
    response += `Payment: ${order.paymentStatus} ${paymentEmoji}\n\n`;
    
    response += `👤 *Customer*\n`;
    response += `Name: ${order.customerName}\n`;
    response += `Phone: ${order.customerPhone}\n`;
    if (order.customerEmail) {
      response += `Email: ${order.customerEmail}\n`;
    }
    response += `\n`;

    response += `💰 *Financial*\n`;
    response += `Total: ₹${parseFloat(order.totalAmount).toLocaleString()}\n`;
    response += `Date: ${new Date(order.createdAt).toLocaleDateString()}\n\n`;

    // Show items
    if (order.items && Array.isArray(order.items)) {
      response += `📋 *Items*\n`;
      order.items.forEach((item, i) => {
        response += `${i + 1}. ${item.productName} x ${item.quantity}\n`;
        response += `   ₹${parseFloat(item.unitPrice).toLocaleString()} each = ₹${parseFloat(item.total).toLocaleString()}\n`;
      });
      response += `\n`;
    }

    if (order.notes) {
      response += `📝 *Notes:* ${order.notes}\n\n`;
    }

    if (order.invoice) {
      response += `📄 Invoice: ${order.invoice.invoiceNumber}\n`;
    }

    response += `\n🌐 View full details:\n${process.env.CLIENT_URL}/orders/${order.id}`;

    return response;

  } catch (error) {
    console.error('Order status error:', error);
    return `❌ Error fetching order details.`;
  }
};

// ==================== LEAVE APPROVAL ====================
const handleLeaveApproval = async (command, user) => {
  if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
    return `🔒 *Access Denied*\n\nOnly managers can approve leaves.`;
  }

  try {
    // Parse: APPROVE LEAVE abc123 or REJECT LEAVE abc123
    const isApprove = command.toUpperCase().includes('APPROVE');
    const leaveId = command.replace(/APPROVE LEAVE|REJECT LEAVE/gi, '').trim();

    if (!leaveId) {
      return `❌ Please provide leave ID.\n\nExample: ${isApprove ? 'APPROVE' : 'REJECT'} LEAVE abc12345\n\nType *PENDING LEAVES* to see all pending requests.`;
    }

    // Find leave request by partial ID
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: {
        id: { startsWith: leaveId },
        status: 'PENDING'
      },
      include: {
        employee: {
          include: { user: true }
        }
      }
    });

    if (!leaveRequest) {
      return `❌ Leave request "${leaveId}" not found or already processed.\n\nType *PENDING LEAVES* to see pending requests.`;
    }

    // Update leave request
    const updated = await prisma.leaveRequest.update({
      where: { id: leaveRequest.id },
      data: {
        status: isApprove ? 'APPROVED' : 'REJECTED',
        approvedBy: user.id,
        approvalDate: new Date()
      }
    });

    // Send notification to employee
    const employeePhone = leaveRequest.employee.user.phone;
    const days = Math.ceil((new Date(leaveRequest.endDate) - new Date(leaveRequest.startDate)) / (1000 * 60 * 60 * 24)) + 1;

    const notificationMessage = `
${isApprove ? '✅' : '❌'} *Leave Request ${isApprove ? 'Approved' : 'Rejected'}*

Type: ${leaveRequest.leaveType}
Dates: ${new Date(leaveRequest.startDate).toLocaleDateString()} - ${new Date(leaveRequest.endDate).toLocaleDateString()}
Duration: ${days} days

${isApprove ? 'Enjoy your time off! 🎉' : 'Please contact your manager for details.'}
    `.trim();

    await sendWhatsAppMessage(employeePhone, notificationMessage);

    return `✅ *Leave Request ${isApprove ? 'Approved' : 'Rejected'}*

Employee: ${leaveRequest.employee.user.name}
Type: ${leaveRequest.leaveType}
Duration: ${days} days

📱 Notification sent to employee.`;

  } catch (error) {
    console.error('Leave approval error:', error);
    return `❌ Error processing leave request.`;
  }
};

// ==================== REPORTS & ANALYTICS ====================
const handleSalesReport = async (command, user) => {
  if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
    return `🔒 *Access Denied*\n\nOnly managers can view sales reports.`;
  }

  try {
    // Parse date from command: SALES REPORT today, SALES REPORT 2025-01-15
    let startDate, endDate;
    const dateStr = command.replace(/SALES REPORT/gi, '').trim().toLowerCase();

    if (dateStr === 'today' || dateStr === '') {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (dateStr === 'yesterday') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (dateStr === 'week' || dateStr === 'this week') {
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
    } else if (dateStr === 'month' || dateStr === 'this month') {
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    } else {
      // Try to parse custom date
      try {
        startDate = parseDate(dateStr);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
      } catch (e) {
        return `❌ Invalid date format.\n\nExamples:\n• SALES REPORT today\n• SALES REPORT yesterday\n• SALES REPORT week\n• SALES REPORT month\n• SALES REPORT 15/01/2025`;
      }
    }

    // Fetch orders
    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;
    const totalRevenue = orders
      .filter(o => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);
    const pendingOrders = orders.filter(o => o.status === 'PENDING').length;

    const periodLabel = dateStr === 'today' ? 'Today' : 
                       dateStr === 'yesterday' ? 'Yesterday' :
                       dateStr === 'week' ? 'This Week' :
                       dateStr === 'month' ? 'This Month' :
                       startDate.toLocaleDateString();

    let response = `📊 *Sales Report - ${periodLabel}*\n\n`;
    response += `📦 Total Orders: *${totalOrders}*\n`;
    response += `✅ Completed: ${completedOrders}\n`;
    response += `⏳ Pending: ${pendingOrders}\n`;
    response += `❌ Cancelled: ${orders.filter(o => o.status === 'CANCELLED').length}\n\n`;
    
    response += `💰 *Revenue*\n`;
    response += `Completed Orders: ₹${totalRevenue.toLocaleString()}\n`;
    if (completedOrders > 0) {
      response += `Average Order Value: ₹${(totalRevenue / completedOrders).toLocaleString()}\n`;
    }
    response += `\n`;

    if (orders.length > 0) {
      response += `📈 *Recent Orders*\n`;
      orders.slice(0, 5).forEach((order, i) => {
        const emoji = {
          'PENDING': '⏳',
          'PROCESSING': '🔄',
          'COMPLETED': '✅',
          'CANCELLED': '❌'
        }[order.status];
        response += `${i + 1}. ${order.orderNumber} ${emoji} ₹${parseFloat(order.totalAmount).toLocaleString()}\n`;
      });
      
      if (orders.length > 5) {
        response += `\n...and ${orders.length - 5} more\n`;
      }
    }

    response += `\n🌐 View detailed analytics:\n${process.env.CLIENT_URL}/dashboard`;

    return response;

  } catch (error) {
    console.error('Sales report error:', error);
    return `❌ Error generating sales report.`;
  }
};

const handleDashboardStats = async (user) => {
  if (!user || !['ADMIN', 'MANAGER'].includes(user.role)) {
    return `🔒 *Access Denied*\n\nOnly managers can view dashboard statistics.`;
  }

  try {
    const [
      totalProducts,
      lowStockCount,
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue,
      pendingLeaves,
      totalEmployees
    ] = await Promise.all([
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.product.count({
        where: {
          status: 'ACTIVE',
          quantity: { lte: prisma.raw('reorder_level') }
        }
      }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'COMPLETED' } }),
      prisma.order.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { totalAmount: true }
      }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.employee.count()
    ]);

    let response = `📊 *Dashboard Statistics*\n\n`;
    
    response += `📦 *Inventory*\n`;
    response += `Total Products: ${totalProducts}\n`;
    response += `Low Stock Items: ${lowStockCount} ${lowStockCount > 0 ? '⚠️' : '✅'}\n\n`;
    
    response += `🛒 *Orders*\n`;
    response += `Total Orders: ${totalOrders}\n`;
    response += `Pending: ${pendingOrders} ⏳\n`;
    response += `Completed: ${completedOrders} ✅\n\n`;
    
    response += `💰 *Revenue*\n`;
    response += `Total: ₹${(totalRevenue._sum.totalAmount || 0).toLocaleString()}\n`;
    if (completedOrders > 0) {
      response += `Avg Order: ₹${((totalRevenue._sum.totalAmount || 0) / completedOrders).toLocaleString()}\n`;
    }
    response += `\n`;
    
    response += `👥 *HR*\n`;
    response += `Total Employees: ${totalEmployees}\n`;
    response += `Pending Leaves: ${pendingLeaves} ${pendingLeaves > 0 ? '⏳' : '✅'}\n\n`;
    
    if (lowStockCount > 0) {
      response += `⚠️ *Action Required*\n`;
      response += `• ${lowStockCount} items need restocking\n`;
      response += `Type *LOW STOCK* for details\n\n`;
    }
    
    if (pendingLeaves > 0) {
      response += `⏳ *Pending Approvals*\n`;
      response += `• ${pendingLeaves} leave requests\n`;
      response += `Type *PENDING LEAVES* to review\n\n`;
    }

    response += `🌐 Full dashboard:\n${process.env.CLIENT_URL}/dashboard`;

    return response;

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return `❌ Error fetching dashboard statistics.`;
  }
};

const handleTodaySummary = async (user) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayOrders, lowStock, pendingLeaves] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: today,
            lt: tomorrow
          }
        }
      }),
      prisma.product.count({
        where: {
          status: 'ACTIVE',
          quantity: { lte: prisma.raw('reorder_level') }
        }
      }),
      user && ['ADMIN', 'MANAGER'].includes(user.role) 
        ? prisma.leaveRequest.count({ where: { status: 'PENDING' } })
        : 0
    ]);

    const completedToday = todayOrders.filter(o => o.status === 'COMPLETED').length;
    const revenueToday = todayOrders
      .filter(o => o.status === 'COMPLETED')
      .reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);

    let response = `📅 *Today's Summary*\n`;
    response += `${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
    
    response += `🛒 *Orders Today*\n`;
    response += `New Orders: ${todayOrders.length}\n`;
    response += `Completed: ${completedToday}\n`;
    response += `Revenue: ₹${revenueToday.toLocaleString()}\n\n`;

    if (lowStock > 0) {
      response += `⚠️ ${lowStock} items low on stock\n`;
    }

    if (pendingLeaves > 0) {
      response += `⏳ ${pendingLeaves} leave requests pending\n`;
    }

    if (todayOrders.length === 0 && lowStock === 0 && pendingLeaves === 0) {
      response += `✅ All caught up! No pending tasks.\n`;
    }

    response += `\n💡 Type HELP for more commands`;

    return response;

  } catch (error) {
    console.error('Today summary error:', error);
    return `❌ Error fetching today's summary.`;
  }
};

// Export all functions
export {
  handleIncomingMessage
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                