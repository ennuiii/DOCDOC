/**
 * Mobile Deep Linking Service
 * Handles mobile deep linking for seamless Google Meet access across devices
 * Supports iOS, Android, and web browser fallbacks
 */

const { createClient } = require('@supabase/supabase-js');
const AuditLogger = require('./AuditLogger');

class MobileDeepLinkService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.auditLogger = new AuditLogger();
        
        // Deep link URL patterns for different platforms
        this.deepLinkPatterns = {
            ios: {
                googleMeet: 'comgooglemeet://meet.google.com/{meetingId}',
                fallback: 'https://meet.google.com/{meetingId}'
            },
            android: {
                googleMeet: 'intent://meet.google.com/{meetingId}#Intent;scheme=https;package=com.google.android.apps.meetings;end',
                fallback: 'https://meet.google.com/{meetingId}'
            },
            web: {
                googleMeet: 'https://meet.google.com/{meetingId}',
                fallback: 'https://meet.google.com/{meetingId}'
            }
        };

        // User agent patterns for device detection
        this.userAgentPatterns = {
            ios: /iPhone|iPad|iPod/i,
            android: /Android/i,
            mobile: /Mobile|Android|iPhone|iPad|iPod/i
        };
    }

    /**
     * Generate deep links for Google Meet based on user device
     * @param {string} meetingUrl - Original Google Meet URL
     * @param {string} userAgent - User agent string
     * @param {Object} options - Additional options
     * @returns {Object} Deep link information
     */
    generateDeepLinks(meetingUrl, userAgent = '', options = {}) {
        try {
            const meetingId = this.extractMeetingId(meetingUrl);
            if (!meetingId) {
                throw new Error('Invalid meeting URL - cannot extract meeting ID');
            }

            const platform = this.detectPlatform(userAgent);
            const deepLinks = this.createDeepLinksForPlatform(meetingId, platform, options);

            this.auditLogger.log('info', 'Deep links generated', {
                meetingId,
                platform,
                userAgent: userAgent.substring(0, 100), // Truncate for logging
                deepLinks
            });

            return {
                success: true,
                meetingId,
                platform,
                deepLinks,
                recommended: deepLinks.primary
            };

        } catch (error) {
            this.auditLogger.log('error', 'Failed to generate deep links', {
                meetingUrl,
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                fallback: meetingUrl
            };
        }
    }

    /**
     * Extract meeting ID from Google Meet URL
     * @param {string} meetingUrl - Google Meet URL
     * @returns {string} Meeting ID
     */
    extractMeetingId(meetingUrl) {
        try {
            // Handle various Google Meet URL formats
            const patterns = [
                /meet\.google\.com\/([a-z0-9-]+)/i,
                /hangouts\.google\.com\/call\/([a-z0-9-]+)/i,
                /meet\.google\.com\/lookup\/([a-z0-9-]+)/i
            ];

            for (const pattern of patterns) {
                const match = meetingUrl.match(pattern);
                if (match && match[1]) {
                    return match[1];
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Detect user's platform based on user agent
     * @param {string} userAgent - User agent string
     * @returns {string} Platform identifier
     */
    detectPlatform(userAgent) {
        if (this.userAgentPatterns.ios.test(userAgent)) {
            return 'ios';
        }
        
        if (this.userAgentPatterns.android.test(userAgent)) {
            return 'android';
        }
        
        return 'web';
    }

    /**
     * Create deep links for specific platform
     * @param {string} meetingId - Meeting ID
     * @param {string} platform - Platform identifier
     * @param {Object} options - Additional options
     * @returns {Object} Platform-specific deep links
     */
    createDeepLinksForPlatform(meetingId, platform, options = {}) {
        const patterns = this.deepLinkPatterns[platform] || this.deepLinkPatterns.web;
        
        const deepLinks = {
            primary: patterns.googleMeet.replace('{meetingId}', meetingId),
            fallback: patterns.fallback.replace('{meetingId}', meetingId),
            web: this.deepLinkPatterns.web.googleMeet.replace('{meetingId}', meetingId)
        };

        // Add platform-specific enhancements
        if (platform === 'android') {
            // Add intent extras for Android
            deepLinks.primaryWithExtras = this.addAndroidIntentExtras(deepLinks.primary, options);
        }

        if (platform === 'ios') {
            // Add iOS universal link support
            deepLinks.universalLink = `https://meet.google.com/${meetingId}`;
        }

        // Add web app URL for PWA support
        deepLinks.webApp = `https://meet.google.com/${meetingId}?pwa=1`;

        return deepLinks;
    }

    /**
     * Add Android intent extras for enhanced functionality
     * @param {string} intentUrl - Base intent URL
     * @param {Object} options - Additional options
     * @returns {string} Enhanced intent URL
     */
    addAndroidIntentExtras(intentUrl, options = {}) {
        const extras = [];
        
        if (options.autoJoin) {
            extras.push('S.auto_join=true');
        }
        
        if (options.displayName) {
            extras.push(`S.display_name=${encodeURIComponent(options.displayName)}`);
        }
        
        if (options.muteOnJoin) {
            extras.push('S.mute_on_join=true');
        }

        if (extras.length > 0) {
            return intentUrl.replace('#Intent;', `#Intent;${extras.join(';')};`);
        }

        return intentUrl;
    }

    /**
     * Generate HTML for smart app detection and deep linking
     * @param {Object} deepLinkData - Deep link data from generateDeepLinks
     * @param {Object} options - Customization options
     * @returns {string} HTML with JavaScript for smart app detection
     */
    generateSmartLinkHTML(deepLinkData, options = {}) {
        const {
            title = 'Join PharmaDOC Meeting',
            subtitle = 'Click to join the meeting',
            timeout = 3000,
            showFallback = true
        } = options;

        const { meetingId, platform, deepLinks } = deepLinkData;

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="Join your PharmaDOC meeting with one click">
    
    <!-- iOS Universal Links -->
    <meta name="apple-itunes-app" content="app-id=1506463065">
    
    <!-- Android App Links -->
    <meta name="google-play-app" content="app-id=com.google.android.apps.meetings">
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .meeting-card {
            background: white;
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            max-width: 400px;
            width: 100%;
        }
        
        .meeting-icon {
            width: 60px;
            height: 60px;
            margin: 0 auto 20px;
            background: #1a73e8;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
        }
        
        h1 {
            color: #202124;
            margin: 0 0 10px;
            font-size: 24px;
            font-weight: 500;
        }
        
        p {
            color: #5f6368;
            margin: 0 0 30px;
            font-size: 16px;
        }
        
        .join-button {
            background: #1a73e8;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 10px;
            transition: background-color 0.2s;
        }
        
        .join-button:hover {
            background: #1557b0;
        }
        
        .join-button.secondary {
            background: #f8f9fa;
            color: #1a73e8;
            border: 1px solid #dadce0;
        }
        
        .join-button.secondary:hover {
            background: #e8f0fe;
        }
        
        .platform-info {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            font-size: 14px;
            color: #5f6368;
        }
        
        .loading {
            display: none;
            margin-top: 20px;
        }
        
        .spinner {
            border: 2px solid #f3f3f3;
            border-radius: 50%;
            border-top: 2px solid #1a73e8;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .error-message {
            color: #d93025;
            margin-top: 15px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="meeting-card">
        <div class="meeting-icon">📹</div>
        <h1>${title}</h1>
        <p>${subtitle}</p>
        
        <button id="joinButton" class="join-button" onclick="joinMeeting()">
            Join with Google Meet App
        </button>
        
        ${showFallback ? `
        <a href="${deepLinks.web}" class="join-button secondary" target="_blank">
            Join in Browser
        </a>
        ` : ''}
        
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Opening Google Meet...</p>
        </div>
        
        <div class="error-message" id="errorMessage">
            Could not open the app. Please try joining in your browser.
        </div>
        
        <div class="platform-info">
            <strong>Meeting ID:</strong> ${meetingId}<br>
            <strong>Platform:</strong> ${platform}<br>
            <strong>One-click join enabled</strong>
        </div>
    </div>

    <script>
        const meetingData = ${JSON.stringify(deepLinkData)};
        const platform = '${platform}';
        
        function joinMeeting() {
            const loading = document.getElementById('loading');
            const errorMessage = document.getElementById('errorMessage');
            const joinButton = document.getElementById('joinButton');
            
            loading.style.display = 'block';
            errorMessage.style.display = 'none';
            joinButton.disabled = true;
            
            try {
                if (platform === 'ios') {
                    // Try iOS app first, then fallback
                    attemptDeepLink('${deepLinks.primary}', '${deepLinks.fallback}');
                } else if (platform === 'android') {
                    // Use Android intent with fallback
                    window.location.href = '${deepLinks.primary}';
                    
                    // Fallback after timeout
                    setTimeout(() => {
                        window.location.href = '${deepLinks.fallback}';
                    }, ${timeout});
                } else {
                    // Web platform - direct link
                    window.open('${deepLinks.web}', '_blank');
                }
                
                // Auto-hide loading after timeout
                setTimeout(() => {
                    loading.style.display = 'none';
                    joinButton.disabled = false;
                }, ${timeout});
                
            } catch (error) {
                console.error('Deep link error:', error);
                showError();
            }
        }
        
        function attemptDeepLink(appUrl, fallbackUrl) {
            // Create invisible iframe for iOS app detection
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = appUrl;
            document.body.appendChild(iframe);
            
            // Fallback timer
            const fallbackTimer = setTimeout(() => {
                window.location.href = fallbackUrl;
                document.body.removeChild(iframe);
            }, ${timeout});
            
            // Clear timer if app opens successfully
            window.addEventListener('blur', () => {
                clearTimeout(fallbackTimer);
                document.body.removeChild(iframe);
            });
        }
        
        function showError() {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('errorMessage').style.display = 'block';
            document.getElementById('joinButton').disabled = false;
        }
        
        // Auto-join if URL parameter is present
        if (new URLSearchParams(window.location.search).get('auto') === 'true') {
            setTimeout(joinMeeting, 1000);
        }
        
        // Analytics tracking
        if (typeof gtag !== 'undefined') {
            gtag('event', 'deep_link_page_view', {
                'meeting_id': '${meetingId}',
                'platform': platform,
                'user_agent': navigator.userAgent.substring(0, 100)
            });
        }
    </script>
</body>
</html>`;
    }

    /**
     * Generate deep link for mobile notifications
     * @param {string} meetingUrl - Original Google Meet URL
     * @param {string} platform - Target platform
     * @param {Object} notificationOptions - Notification specific options
     * @returns {Object} Notification deep link data
     */
    generateNotificationDeepLink(meetingUrl, platform, notificationOptions = {}) {
        try {
            const meetingId = this.extractMeetingId(meetingUrl);
            if (!meetingId) {
                throw new Error('Invalid meeting URL');
            }

            const {
                displayName,
                autoJoin = true,
                muteOnJoin = false
            } = notificationOptions;

            const deepLinks = this.createDeepLinksForPlatform(meetingId, platform, {
                autoJoin,
                displayName,
                muteOnJoin
            });

            // Create notification-specific deep link
            const notificationLink = this.createNotificationSpecificLink(
                deepLinks.primary,
                platform,
                notificationOptions
            );

            return {
                success: true,
                notificationLink,
                fallbackLink: deepLinks.fallback,
                webLink: deepLinks.web,
                meetingId
            };

        } catch (error) {
            this.auditLogger.log('error', 'Failed to generate notification deep link', {
                meetingUrl,
                platform,
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                fallbackLink: meetingUrl
            };
        }
    }

    /**
     * Create notification-specific deep link with custom parameters
     */
    createNotificationSpecificLink(baseLink, platform, options) {
        const {
            source = 'notification',
            appointmentId,
            userId
        } = options;

        // Add tracking parameters for analytics
        const trackingParams = new URLSearchParams({
            utm_source: 'pharmadoc',
            utm_medium: 'notification',
            utm_campaign: 'meeting_reminder',
            utm_content: platform
        });

        if (appointmentId) {
            trackingParams.set('appointment_id', appointmentId);
        }

        if (userId) {
            trackingParams.set('user_id', userId);
        }

        // For web links, append tracking parameters
        if (platform === 'web' || baseLink.startsWith('https://')) {
            const separator = baseLink.includes('?') ? '&' : '?';
            return `${baseLink}${separator}${trackingParams.toString()}`;
        }

        return baseLink;
    }

    /**
     * Track deep link usage for analytics
     * @param {string} linkType - Type of deep link used
     * @param {Object} metadata - Additional tracking data
     */
    async trackDeepLinkUsage(linkType, metadata = {}) {
        try {
            const trackingData = {
                link_type: linkType,
                platform: metadata.platform,
                success: metadata.success,
                meeting_id: metadata.meetingId,
                user_id: metadata.userId,
                appointment_id: metadata.appointmentId,
                user_agent: metadata.userAgent,
                created_at: new Date().toISOString()
            };

            // Store in analytics table
            await this.supabase
                .from('deep_link_analytics')
                .insert(trackingData);

            // Log for audit trail
            this.auditLogger.log('info', 'Deep link usage tracked', trackingData);

        } catch (error) {
            // Don't throw on analytics failure
            this.auditLogger.log('warn', 'Failed to track deep link usage', {
                error: error.message,
                metadata
            });
        }
    }

    /**
     * Generate QR code data for easy mobile access
     * @param {string} meetingUrl - Meeting URL
     * @param {Object} options - QR code options
     * @returns {Object} QR code data
     */
    generateQRCodeData(meetingUrl, options = {}) {
        const {
            size = 200,
            errorCorrection = 'M',
            includeLabel = true
        } = options;

        return {
            url: meetingUrl,
            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(meetingUrl)}&ecc=${errorCorrection}`,
            label: includeLabel ? 'Scan to join meeting' : null,
            size
        };
    }
}

module.exports = MobileDeepLinkService; 