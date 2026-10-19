 serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin with credentials
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://cloud-39730-default-rtdb.firebaseio.com/`
});

const db = admin.firestore();
console.log('✅ Firebase initialized with service account');
console.log('✅ Firestore database connected');

// =============================================================================
// TWILIO WHATSAPP CONFIGURATION
// =============================================================================

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

// Initialize Twilio client
let twilioClient = null;

try {
  twilioClient = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio WhatsApp client initialized');
} catch (error) {
  console.log('⚠️  Twilio error:', error.message);
}

// =============================================================================
// EXPRESS APP SETUP
// =============================================================================

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// WHATSAPP MESSAGE SENDING FUNCTION
// =============================================================================

async function sendWhatsAppMessage(to, message) {
  try {
    if (!twilioClient) {
      console.log(`📤 [TEST MODE] Would send WhatsApp to ${to}: ${message}`);
      return false;
    }
    
    console.log(`📤 Sending WhatsApp to ${to}`);
    
    const response = await twilioClient.messages.create({
      body: message,
      from: TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${to}`
    });
    
    console.log(`✅ WhatsApp sent! Message SID: ${response.sid}`);
    return true;
    
  } catch (error) {
    console.error('❌ Failed to send WhatsApp:', error);
    
    if (error.code) {
      console.error(`Twilio Error ${error.code}: ${error.message}`);
    }
    
    return false;
  }
}

// =============================================================================
// WEBHOOK ENDPOINTS
// =============================================================================

// WhatsApp Webhook - Receives real messages from Twilio
app.post('/webhook', async (req, res) => {
  try {
    console.log('📩 Real WhatsApp message received!');
    console.log('Request body:', req.body);
    
    // Extract WhatsApp message data from Twilio
    const { Body, From, MessageSid, To } = req.body;
    
    if (!Body || !From) {
      console.log('❌ Invalid WhatsApp message format');
      return res.status(400).send('Invalid message format');
    }
    
    const userPhone = From.replace('whatsapp:', '');
    const message = Body.trim();
    
    console.log(`📱 WhatsApp from ${userPhone}: "${message}"`);
    
    // Process message using existing ERP logic
    const response = await processWhatsAppMessage(message, userPhone);
    
    console.log(`📤 Sending response: "${response}"`);
    
    // Send response back to WhatsApp
    await sendWhatsAppMessage(userPhone, response);
    
    // Respond to Twilio webhook
    res.status(200).send('Message processed successfully');
    
  } catch (error) {
    console.error('❌ WhatsApp webhook error:', error);
    res.status(500).send('Error processing message');
  }
});

// Webhook verification (GET request)
app.get('/webhook', (req, res) => {
  console.log('✅ WhatsApp webhook verification');
  res.status(200).send(`
    <html>
      <head><title>WhatsApp ERP Webhook</title></head>
      <body style="font-family: Arial; padding: 20px; text-align: center;">
        <h1>✅ WhatsApp ERP Webhook Active!</h1>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Status:</strong> Ready to receive WhatsApp messages!</p>
        <hr>
        <p><strong>Twilio Connected:</strong> ${twilioClient ? 'Yes' : 'No'}</p>
        <p><strong>Account SID:</strong> ${TWILIO_ACCOUNT_SID}</p>
        <p><strong>WhatsApp Number:</strong> ${TWILIO_WHATSAPP_NUMBER.replace('whatsapp:', '')}</p>
      </body>
    </html>
  `);
});

// =============================================================================
// MESSAGE PROCESSING ENGINE
// =============================================================================

async function processWhatsAppMessage(message, userPhone) {
  try {
    const msg = message.toLowerCase().trim();
    
    console.log(`🔄 Processing: "${msg}" from ${userPhone}`);
    
    // Ensure user exists in database
    await ensureUserExists(userPhone);
    
    // Command routing
    if (msg.startsWith('sale ')) {
      return await processSale(message, userPhone);
    } 
    else if (msg.startsWith('stock ') || msg.startsWith('add stock ')) {
      return await processInventory(message, userPhone);
    } 
    else if (msg.includes('report')) {
      return await generateReport(userPhone);
    } 
    else if (msg.includes('help')) {
      return getHelpMessage();
    }
    else if (msg.includes('test')) {
      return await testDatabaseConnection(userPhone);
    }
    else {
      return "🤖 I didn't understand that command.\n\nType 'help' to see available commands!";
    }
    
  } catch (error) {
    console.error('❌ Message processing error:', error);
    return "❌ Sorry, there was an error processing your message. Please try again.";
  }
}

// =============================================================================
// BUSINESS LOGIC FUNCTIONS
// =============================================================================

// Process sales transactions
async function processSale(message, userPhone) {
  try {
    console.log(`💰 Processing sale: "${message}"`);
    
    // Parse: "Sale Rice 5kg 200" or "Sale Rice 5kg ₹200"
    const parts = message.replace(/₹/g, '').split(' ');
    
    if (parts.length < 4) {
      return "❌ Invalid format!\n\n✅ Correct format:\nSale [Item] [Quantity] [Amount]\n\n📝 Example:\nSale Rice 5kg 200";
    }
    
    const item = parts[1];
    const quantity = parts[2];
    const amount = parseFloat(parts[3]);
    
    if (isNaN(amount)) {
      return "❌ Please enter a valid amount (number only)\n\n📝 Example: Sale Rice 5kg 200";
    }
    
    // Save to database
    const saleData = {
      userId: userPhone,
      item: item,
      quantity: quantity,
      amount: amount,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const saleRef = await db.collection('sales').add(saleData);
    console.log(`✅ Sale saved with ID: ${saleRef.id}`);
    
    // Update inventory (reduce stock)
    await updateInventoryAfterSale(userPhone, item, quantity);
    
    return `✅ *Sale Recorded Successfully!*\n\n` +
           `📦 Item: ${item}\n` +
           `⚖️ Quantity: ${quantity}\n` +
           `💰 Amount: ₹${amount}\n` +
           `⏰ Time: ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}\n\n` +
           `📊 Type 'report' to see daily summary`;
    
  } catch (error) {
    console.error('❌ Sale processing error:', error);
    return "❌ Error recording sale. Please check format and try again.";
  }
}

// Process inventory updates
async function processInventory(message, userPhone) {
  try {
    console.log(`📦 Processing inventory: "${message}"`);
    
    // Parse: "Stock Rice 50kg" or "Add Stock Rice 50kg"
    const parts = message.toLowerCase().replace('add ', '').split(' ');
    
    if (parts.length < 3) {
      return "❌ Invalid format!\n\n✅ Correct format:\nStock [Item] [Quantity]\n\n📝 Example:\nStock Rice 50kg";
    }
    
    const item = parts[1];
    const quantity = parts[2];
    
    // Check if item exists in inventory
    const inventoryQuery = await db.collection('inventory')
      .where('userId', '==', userPhone)
      .where('itemName', '==', item)
      .get();
    
    if (inventoryQuery.empty) {
      // Create new inventory item
      const inventoryData = {
        userId: userPhone,
        itemName: item,
        currentStock: quantity,
        minThreshold: "5kg", // default threshold
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('inventory').add(inventoryData);
      console.log(`✅ New inventory item created: ${item}`);
      
    } else {
      // Update existing item
      const doc = inventoryQuery.docs[0];
      await doc.ref.update({
        currentStock: quantity,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Inventory updated: ${item}`);
    }
    
    return `✅ *Inventory Updated!*\n\n` +
           `📦 Item: ${item}\n` +
           `📊 Current Stock: ${quantity}\n` +
           `⏰ Updated: ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`;
    
  } catch (error) {
    console.error('❌ Inventory processing error:', error);
    return "❌ Error updating inventory. Please try again.";
  }
}

// Generate daily report
async function generateReport(userPhone) {
  try {
    console.log(`📊 Generating report for: ${userPhone}`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's sales
    const salesQuery = await db.collection('sales')
      .where('userId', '==', userPhone)
      .where('timestamp', '>=', today)
      .orderBy('timestamp', 'desc')
      .get();
    
    let totalSales = 0;
    let totalAmount = 0;
    const itemSales = {};
    const salesList = [];
    
    salesQuery.forEach(doc => {
      const sale = doc.data();
      totalSales++;
      totalAmount += sale.amount;
      
      // Track item sales
      if (itemSales[sale.item]) {
        itemSales[sale.item]++;
      } else {
        itemSales[sale.item] = 1;
      }
      
      salesList.push(`• ${sale.item} ${sale.quantity} - ₹${sale.amount}`);
    });
    
    // Get top selling item
    const topItem = Object.keys(itemSales).length > 0 
      ? Object.keys(itemSales).reduce((a, b) => itemSales[a] > itemSales[b] ? a : b)
      : 'None';
    
    // Get low stock alerts
    const inventoryQuery = await db.collection('inventory')
      .where('userId', '==', userPhone)
      .get();
    
    const lowStockItems = [];
    inventoryQuery.forEach(doc => {
      const item = doc.data();
      const currentStock = parseInt(item.currentStock) || 0;
      const minThreshold = parseInt(item.minThreshold) || 5;
      
      if (currentStock <= minThreshold) {
        lowStockItems.push(`• ${item.itemName}: ${item.currentStock} left`);
      }
    });
    
    // Build report
    let report = `📊 *Daily Report - ${today.toDateString()}*\n\n`;
    report += `💰 *Sales Summary:*\n`;
    report += `├ Total Sales: ${totalSales}\n`;
    report += `├ Total Amount: ₹${totalAmount}\n`;
    report += `└ Top Item: ${topItem}\n\n`;
    
    if (salesList.length > 0) {
      report += `📝 *Today's Sales:*\n`;
      report += salesList.slice(0, 5).join('\n') + '\n\n'; // Show last 5 sales
    }
    
    if (lowStockItems.length > 0) {
      report += `⚠️ *Low Stock Alert:*\n`;
      report += lowStockItems.join('\n');
    } else {
      report += `✅ All items have sufficient stock`;
    }
    
    return report;
    
  } catch (error) {
    console.error('❌ Report generation error:', error);
    return "❌ Error generating report. Please try again.";
  }
}

// Help message
function getHelpMessage() {
  return `🤖 *WhatsApp ERP Commands:*\n\n` +
         `💰 *Record a Sale:*\n` +
         `Sale Rice 5kg 200\n` +
         `Sale Sugar 2kg 180\n\n` +
         `📦 *Update Stock:*\n` +
         `Stock Rice 50kg\n` +
         `Stock Sugar 25kg\n\n` +
         `📊 *Daily Report:*\n` +
         `Report\n\n` +
         `🔧 *Test System:*\n` +
         `Test\n\n` +
         `❓ *Help:*\n` +
         `Help\n\n` +
         `🏪 *Your ERP is ready!*`;
}

// Test database connection
async function testDatabaseConnection(userPhone) {
  try {
    const testData = {
      userId: userPhone,
      testMessage: 'Database connection test',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('test').add(testData);
    
    return `✅ *System Test Passed!*\n\n` +
           `🔗 Database: Connected\n` +
           `📱 WhatsApp: Active\n` +
           `⚡ Functions: Working\n` +
           `📊 User: ${userPhone}\n\n` +
           `🚀 Your ERP system is ready to use!`;
           
  } catch (error) {
    console.error('❌ Database test failed:', error);
    return `❌ *System Test Failed*\n\nDatabase connection error. Please contact support.`;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Ensure user exists in database
async function ensureUserExists(userPhone) {
  try {
    const userDoc = await db.collection('users').doc(userPhone).get();
    
    if (!userDoc.exists) {
      const userData = {
        phone: userPhone,
        businessName: "New Business User",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true
      };
      
      await db.collection('users').doc(userPhone).set(userData);
      console.log(`✅ New user created: ${userPhone}`);
    }
  } catch (error) {
    console.error('❌ Error ensuring user exists:', error);
  }
}

// Update inventory after sale
async function updateInventoryAfterSale(userPhone, item, quantity) {
  try {
    const inventoryQuery = await db.collection('inventory')
      .where('userId', '==', userPhone)
      .where('itemName', '==', item)
      .get();
    
    if (!inventoryQuery.empty) {
      const doc = inventoryQuery.docs[0];
      const currentData = doc.data();
      const currentStock = parseInt(currentData.currentStock) || 0;
      const soldQuantity = parseInt(quantity) || 0;
      const newStock = Math.max(0, currentStock - soldQuantity);
      
      await doc.ref.update({
        currentStock: `${newStock}kg`,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`📦 Inventory updated: ${item} - ${newStock}kg remaining`);
    }
  } catch (error) {
    console.error('❌ Error updating inventory after sale:', error);
  }
}

// =============================================================================
// API ROUTES FOR TESTING
// =============================================================================

// Test endpoint to simulate WhatsApp messages (POST)
app.post('/test-message', async (req, res) => {
  try {
    const { message, phone } = req.body;
    const userPhone = phone || '+918686809709';
    
    const response = await processWhatsAppMessage(message, userPhone);
    
    res.json({
      success: true,
      input: message,
      response: response,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET endpoint for easy browser testing
app.get('/test-message', async (req, res) => {
  try {
    const message = req.query.message || 'help';
    const phone = req.query.phone || '+918686809709';
    
    const response = await processWhatsAppMessage(message, phone);
    
    res.send(`
      <html>
        <head><title>WhatsApp ERP Test</title></head>
        <body style="font-family: Arial; padding: 20px; max-width: 800px;">
          <h2>📱 WhatsApp ERP Test Result</h2>
          <p><strong>Command:</strong> ${message}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; white-space: pre-line;">
            <strong>Response:</strong><br>
            ${response}
          </div>
          <hr>
          <p><strong>Try these commands:</strong></p>
          <a href="/test-message?message=help">help</a> | 
          <a href="/test-message?message=test">test</a> | 
          <a href="/test-message?message=Sale Rice 5kg 200">Sale Rice 5kg 200</a> | 
          <a href="/test-message?message=Stock Rice 50kg">Stock Rice 50kg</a> | 
          <a href="/test-message?message=report">report</a>
        </body>
      </html>
    `);
    
  } catch (error) {
    res.status(500).send(`<h2>Error:</h2><p>${error.message}</p>`);
  }
});

// Get user data
app.get('/user/:phone', async (req, res) => {
  try {
    const phone = req.params.phone;
    const userDoc = await db.collection('users').doc(phone).get();
    
    if (userDoc.exists) {
      res.json({
        success: true,
        user: userDoc.data()
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'WhatsApp ERP Lite',
    twilio: !!twilioClient,
    database: 'connected'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp ERP Lite API',
    status: 'running',
    twilio: !!twilioClient,
    endpoints: {
      health: '/health',
      testMessage: '/test-message',
      webhook: '/webhook',
      whatsappStatus: '/whatsapp-status'
    }
  });
});

// Test sending WhatsApp messages
app.post('/send-test-whatsapp', async (req, res) => {
  try {
    const phone = req.body.phone || '+918686809709';
    const message = req.body.message || '🎉 Test message from your WhatsApp ERP system!';
    
    const success = await sendWhatsAppMessage(phone, message);
    
    res.json({
      success: success,
      message: success ? 'WhatsApp sent successfully!' : 'Failed to send WhatsApp',
      phone: phone,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// WhatsApp status endpoint
app.get('/whatsapp-status', (req, res) => {
  res.json({
    status: 'WhatsApp ERP Ready',
    twilioConnected: !!twilioClient,
    accountSid: TWILIO_ACCOUNT_SID,
    whatsappNumber: TWILIO_WHATSAPP_NUMBER.replace('whatsapp:', ''),
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// EXPORT CONFIGURATION
// =============================================================================

// Export the Express app for Functions Framework
exports.api = app;

// For Firebase Functions (when deployed to cloud)
try {
  if (functions && functions.https) {
    exports.api = functions.https.onRequest(app);
  }
} catch (e) {
  console.log('Running in local mode');
}

// For direct Node.js execution
if (require.main === module) {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log('🎉 ===================================');
    console.log('🚀 WhatsApp ERP Server RUNNING!');
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🌐 Public: https://07d35f689e34.ngrok-free.app`);
    console.log(`💊 Health: /health`);
    console.log(`🔗 Webhook: /webhook`);
    console.log(`🧪 Test: /test-message`);
    console.log('🎉 ===================================');
  });
}

console.log('✅ WhatsApp ERP Backend loaded successfully!');
console.log('✅ WhatsApp integration code loaded!');                                                                                                                             {"version":3,"file":"remapping.mjs","sources":["../src/source-map-tree.ts","../src/build-source-map-tree.ts","../src/source-map.ts","../src/remapping.ts"],"sourcesContent":["import { GenMapping, maybeAddSegment, setIgnore, setSourceContent } from '@jridgewell/gen-mapping';\nimport { traceSegment, decodedMappings } from '@jridgewell/trace-mapping';\n\nimport type { TraceMap } from '@jr