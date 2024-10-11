const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express()

app.use(cors())

mongoose.connect('mongodb://localhost:27017/cryptoData', { useNewUrlParser: true, useUnifiedTopology: true });


const Schema = new mongoose.Schema({
    currentPrice: { type: Number, required: true },
    marketCap: { type: Number, required: true },
    priceChange24h: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
});

const Bitcoin = mongoose.model('Bitcoin', Schema);
const Matic = mongoose.model('Matic', Schema);
const Ethereum = mongoose.model('Ethereum', Schema);


const coinModels = {
    bitcoin: Bitcoin,
    matic: Matic,
    ethereum: Ethereum
};

app.get('/',async(req,res)=> {
    res.json("Welcome")
})


app.get('/stats/:id',async(req,res) => {
    const coinId = req.params.id.toLowerCase();
    const Model = coinModels[coinId];
  
    if (!Model) {
      return res.status(404).json({ error: 'Coin not found' });
    }
  
    try {
      const latestData = await Model.findOne().sort({ timestamp: -1 });
      if (!latestData) {
        return res.status(404).json({ error: 'No data available for this coin' });
      }
      res.json(latestData);
    } catch (error) {
      console.error('Error fetching coin data:', error);
      res.status(500).json({ error: 'Internal server error' });
    }


})

app.get('/deviation/:id',async(req,res) => {
    const coinId = req.params.id.toLowerCase();
    const Model = coinModels[coinId];
  
    if (!Model) {
      return res.status(404).json({ error: 'Coin not found' });
    }
  
    try {
      const records = await Model.find({}, 'currentPrice')
                                  .sort({ timestamp: -1 })
                                  .limit(100)
                                  .lean();
  
      if (records.length === 0) {
        return res.status(404).json({ error: 'No data available for this coin' });
      }
  
      const prices = records.map(record => record.currentPrice);
      const stdDev = calculateStandardDeviation(prices);
  
      res.json({
        coin: coinId,
        standardDeviation: stdDev,
        dataPoints: prices.length,
        message: prices.length < 100 ? 'Calculated with available records (less than 100)' : 'Calculated with last 100 records'
      });
    } catch (error) {
      console.error('Error calculating standard deviation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
})



function calculateStandardDeviation(values) {
    const n = values.length;
    if (n === 0) return 0;
  
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    const variance = squaredDifferences.reduce((sum, value) => sum + value, 0) / n;
    return Math.sqrt(variance);
  }

async function backgroundFetch(){


    try {
        
        const fetch = await axios.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin%2Cmatic%2Cethereum%20',{
            headers: {accept: 'application/json', 'x-cg-demo-api-key': process.env.CRYPTO_API_KEY}
        })
    
        const res = fetch.json()
    
        const data = res.data;
    
        for (const [crypto, Model] of Object.entries(coinModels)) {
            if (data[crypto]) {
              await Model.create({
                currentPrice: data[crypto].current_price,
                marketCap: data[crypto].market_cap,
                priceChange24h: data[crypto].price_change_24h
              });
              console.log(`${crypto.charAt(0).toUpperCase() + crypto.slice(1)} data inserted successfully`);
            }
        }

        console.log('All cryptocurrency data fetched and inserted successfully');
    } catch (error) {
        
        console.error('Error fetching or inserting cryptocurrency data:', error);

    }
    

        
}

cron.schedule('* * 2 * *', () => {
    console.log('running a task every two hours');
    backgroundFetch();
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
