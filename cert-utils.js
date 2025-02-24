const fs = require('fs');
const path = require('path');
const https = require('https');

// Logger will be passed from server.js
let logger;

/**
 * Initialize the certificate utilities with the logger
 * @param {Object} loggerInstance - The winston logger instance
 */
const init = (loggerInstance) => {
    logger = loggerInstance;
};

/**
 * Load HTTPS certificates from the Let's Encrypt directory
 * @param {string} domain - The domain name
 * @returns {Object|null} - The certificate options or null if not available
 */
const loadCertificates = (domain = '11oclocktoast.com') => {
    try {
        const certPath = `/etc/letsencrypt/live/${domain}`;
        
        // Check if certificates exist
        if (!fs.existsSync(path.join(certPath, 'privkey.pem')) ||
            !fs.existsSync(path.join(certPath, 'cert.pem')) ||
            !fs.existsSync(path.join(certPath, 'chain.pem'))) {
            
            logger?.error('Certificate files are missing', { domain });
            return null;
        }
        
        const options = {
            key: fs.readFileSync(path.join(certPath, 'privkey.pem')),
            cert: fs.readFileSync(path.join(certPath, 'cert.pem')),
            ca: fs.readFileSync(path.join(certPath, 'chain.pem'))
        };
        
        logger?.info('HTTPS certificates loaded successfully', { domain });
        return options;
    } catch (error) {
        logger?.error('Failed to load HTTPS certificates', { 
            error: error.message,
            domain
        });
        return null;
    }
};

/**
 * Setup automatic certificate renewal checking
 * @param {https.Server} server - The HTTPS server instance
 * @param {string} domain - The domain name
 * @param {number} checkInterval - The interval in milliseconds to check for certificate renewal
 */
const setupCertificateRenewal = (server, domain = '11oclocktoast.com', checkInterval = 24 * 60 * 60 * 1000) => {
    if (!server) {
        logger?.error('Cannot setup certificate renewal without a server instance');
        return;
    }
    
    // Initial certificate load time
    let lastCertLoadTime = Date.now();
    
    // Setup interval to check for certificate renewal
    setInterval(() => {
        try {
            const certPath = `/etc/letsencrypt/live/${domain}`;
            const certStat = fs.statSync(path.join(certPath, 'cert.pem'));
            const certModified = new Date(certStat.mtime).getTime();
            
            // If certificate has been modified since last load
            if (certModified > lastCertLoadTime) {
                logger?.info('Certificate renewal detected, updating server', { domain });
                
                const newCertificates = loadCertificates(domain);
                if (newCertificates) {
                    server.setSecureContext(newCertificates);
                    lastCertLoadTime = Date.now();
                    logger?.info('Server certificates updated successfully', { domain });
                }
            }
        } catch (error) {
            logger?.error('Error checking for certificate renewal', { 
                error: error.message,
                domain
            });
        }
    }, checkInterval);
    
    logger?.info('Certificate renewal checking enabled', { 
        domain, 
        checkIntervalHours: checkInterval / (60 * 60 * 1000)
    });
};

module.exports = {
    init,
    loadCertificates,
    setupCertificateRenewal
};
