const article = require('../services/article-service')

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let isSyncing = false;

async function syncDatabase(req, res) {
  if (isSyncing) {
    return res.status(429).json({ message: 'Sync is already in progress. Please try again later.' });
  }

  isSyncing = true;

  try {
    console.time('SyncDatabaseTime'); // Start the timer

    const statistics = await article.syncDatabase();

    console.timeEnd('SyncDatabaseTime'); // End the timer and log the time taken

    res.status(200).json({ 
      statistics: statistics,  
      message: 'Articles synchronized successfully' 
    });
  } catch (error) {
    console.error('Error syncing articles:', error);
    res.status(500).json({ message: 'Error syncing articles' });
  } finally {
    await delay(5000);
    isSyncing = false; // Release the lock
  }

}

module.exports = { syncDatabase };