/**
 * CalDAV Client for Universal Calendar Support
 * Supports Apple iCloud, Yahoo, and generic CalDAV providers
 */

import axios from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import ical from 'ical';
import crypto from 'crypto';
import logger from '../../../../utils/logger.js';
import { TimezoneService } from '../../services/TimezoneService.js';

class CalDAVClient {
  constructor(config = {}) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };

    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      removeNSPrefix: true,
      parseTagValue: false
    });

    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      removeNSPrefix: true,
      suppressEmptyNode: true
    });

    this.timezoneService = new TimezoneService();
    this.authCache = new Map();
  }

  /**
   * Detect CalDAV provider and configure endpoints
   */
  async detectProvider(serverUrl, username) {
    try {
      logger.info('Detecting CalDAV provider', { serverUrl, username });

      // Apple iCloud detection
      if (serverUrl.includes('icloud.com') || serverUrl.includes('me.com')) {
        return this.configureAppleiCloud(username);
      }

      // Yahoo Calendar detection
      if (serverUrl.includes('yahoo.com') || serverUrl.includes('caldav.calendar.yahoo.com')) {
        return this.configureYahooCalendar(username);
      }

      // Google Calendar CalDAV (backup method)
      if (serverUrl.includes('google.com') || serverUrl.includes('googleapis.com')) {
        return this.configureGoogleCalDAV(username);
      }

      // Generic CalDAV server
      return this.configureGenericCalDAV(serverUrl, username);

    } catch (error) {
      logger.error('CalDAV provider detection failed', error);
      throw new Error(`Failed to detect CalDAV provider: ${error.message}`);
    }
  }

  /**
   * Configure Apple iCloud CalDAV
   */
  configureAppleiCloud(username) {
    return {
      provider: 'apple_icloud',
      serverUrl: 'https://caldav.icloud.com',
      principalUrl: `https://caldav.icloud.com/${username.split('@')[0]}/principal/`,
      calendarHomeUrl: `https://caldav.icloud.com/${username.split('@')[0]}/calendars/`,
      username,
      requiresAppPassword: true,
      supportsColors: true,
      supportsTimeZones: true,
      capabilities: ['calendar-access', 'calendar-schedule', 'calendar-auto-schedule']
    };
  }

  /**
   * Configure Yahoo Calendar CalDAV
   */
  configureYahooCalendar(username) {
    return {
      provider: 'yahoo',
      serverUrl: 'https://caldav.calendar.yahoo.com',
      principalUrl: `https://caldav.calendar.yahoo.com/dav/${username}/principal/`,
      calendarHomeUrl: `https://caldav.calendar.yahoo.com/dav/${username}/Calendar/`,
      username,
      requiresAppPassword: true,
      supportsColors: false,
      supportsTimeZones: true,
      capabilities: ['calendar-access']
    };
  }

  /**
   * Configure Google Calendar CalDAV
   */
  configureGoogleCalDAV(username) {
    return {
      provider: 'google_caldav',
      serverUrl: 'https://apidata.googleusercontent.com',
      principalUrl: `https://apidata.googleusercontent.com/caldav/v2/${username}/user`,
      calendarHomeUrl: `https://apidata.googleusercontent.com/caldav/v2/${username}/events/`,
      username,
      requiresAppPassword: false,
      supportsColors: true,
      supportsTimeZones: true,
      capabilities: ['calendar-access', 'calendar-schedule']
    };
  }

  /**
   * Configure generic CalDAV server
   */
  async configureGenericCalDAV(serverUrl, username) {
    try {
      // Clean server URL
      const baseUrl = serverUrl.replace(/\/$/, '');
      
      // Discover principal URL
      const principalUrl = await this.discoverPrincipalUrl(baseUrl, username);
      
      // Discover calendar home URL
      const calendarHomeUrl = await this.discoverCalendarHomeUrl(principalUrl, username);

      return {
        provider: 'generic',
        serverUrl: baseUrl,
        principalUrl,
        calendarHomeUrl,
        username,
        requiresAppPassword: false,
        supportsColors: false,
        supportsTimeZones: true,
        capabilities: ['calendar-access']
      };

    } catch (error) {
      logger.error('Generic CalDAV configuration failed', error);
      throw new Error(`Failed to configure generic CalDAV: ${error.message}`);
    }
  }

  /**
   * Discover principal URL using CalDAV well-known
   */
  async discoverPrincipalUrl(serverUrl, username) {
    try {
      const wellKnownUrl = `${serverUrl}/.well-known/caldav`;
      
      const response = await this.makeRequest('PROPFIND', wellKnownUrl, {
        headers: {
          'Depth': '0',
          'Content-Type': 'application/xml'
        },
        body: this.buildPropfindXML(['current-user-principal'])
      });

      const parsed = this.xmlParser.parse(response.data);
      const principal = this.extractProperty(parsed, 'current-user-principal');
      
      if (principal && principal.href) {
        return this.resolveUrl(serverUrl, principal.href);
      }

      // Fallback to common pattern
      return `${serverUrl}/principals/${username}/`;

    } catch (error) {
      logger.warn('Principal discovery failed, using fallback', error);
      return `${serverUrl}/principals/${username}/`;
    }
  }

  /**
   * Discover calendar home URL
   */
  async discoverCalendarHomeUrl(principalUrl, username) {
    try {
      const response = await this.makeRequest('PROPFIND', principalUrl, {
        headers: {
          'Depth': '0',
          'Content-Type': 'application/xml'
        },
        body: this.buildPropfindXML(['calendar-home-set'])
      });

      const parsed = this.xmlParser.parse(response.data);
      const calendarHome = this.extractProperty(parsed, 'calendar-home-set');
      
      if (calendarHome && calendarHome.href) {
        return this.resolveUrl(principalUrl, calendarHome.href);
      }

      // Fallback to common pattern
      const serverUrl = principalUrl.split('/principals/')[0];
      return `${serverUrl}/calendars/${username}/`;

    } catch (error) {
      logger.warn('Calendar home discovery failed, using fallback', error);
      const serverUrl = principalUrl.split('/principals/')[0];
      return `${serverUrl}/calendars/${username}/`;
    }
  }

  /**
   * Authenticate with CalDAV server
   */
  async authenticate(config, password) {
    try {
      logger.info('Authenticating with CalDAV server', { 
        provider: config.provider, 
        username: config.username 
      });

      // Test authentication with a simple PROPFIND
      const response = await this.makeRequest('PROPFIND', config.principalUrl, {
        auth: {
          username: config.username,
          password
        },
        headers: {
          'Depth': '0',
          'Content-Type': 'application/xml'
        },
        body: this.buildPropfindXML(['displayname'])
      });

      if (response.status === 200 || response.status === 207) {
        // Cache authentication
        const authKey = `${config.provider}:${config.username}`;
        this.authCache.set(authKey, {
          username: config.username,
          password,
          expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        });

        logger.info('CalDAV authentication successful', { provider: config.provider });
        return true;
      }

      throw new Error('Authentication failed');

    } catch (error) {
      logger.error('CalDAV authentication failed', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Discover calendars
   */
  async discoverCalendars(config) {
    try {
      const auth = this.getAuthFromCache(config);
      if (!auth) {
        throw new Error('Authentication required');
      }

      logger.info('Discovering CalDAV calendars', { provider: config.provider });

      const response = await this.makeRequest('PROPFIND', config.calendarHomeUrl, {
        auth,
        headers: {
          'Depth': '1',
          'Content-Type': 'application/xml'
        },
        body: this.buildPropfindXML([
          'displayname',
          'calendar-description',
          'calendar-color',
          'supported-calendar-component-set',
          'resourcetype'
        ])
      });

      const parsed = this.xmlParser.parse(response.data);
      const calendars = this.parseCalendarList(parsed, config);

      logger.info(`Found ${calendars.length} calendars`, { provider: config.provider });
      return calendars;

    } catch (error) {
      logger.error('Calendar discovery failed', error);
      throw new Error(`Failed to discover calendars: ${error.message}`);
    }
  }

  /**
   * Sync calendar events
   */
  async syncCalendarEvents(config, calendar, lastSyncToken = null) {
    try {
      const auth = this.getAuthFromCache(config);
      if (!auth) {
        throw new Error('Authentication required');
      }

      logger.info('Syncing calendar events', {
        provider: config.provider,
        calendar: calendar.name,
        lastSyncToken
      });

      let events = [];

      if (lastSyncToken && config.capabilities.includes('sync-collection')) {
        // Use sync-collection for efficient incremental sync
        events = await this.performSyncCollectionSync(config, calendar, lastSyncToken, auth);
      } else {
        // Fallback to full sync
        events = await this.performFullSync(config, calendar, auth);
      }

      // Process and normalize events
      const normalizedEvents = events.map(event => this.normalizeEvent(event, config));

      logger.info(`Synced ${normalizedEvents.length} events`, {
        provider: config.provider,
        calendar: calendar.name
      });

      return {
        events: normalizedEvents,
        syncToken: this.generateSyncToken(config, calendar),
        lastModified: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Calendar sync failed', error);
      throw new Error(`Failed to sync calendar: ${error.message}`);
    }
  }

  /**
   * Create calendar event
   */
  async createEvent(config, calendar, eventData) {
    try {
      const auth = this.getAuthFromCache(config);
      if (!auth) {
        throw new Error('Authentication required');
      }

      const eventUid = eventData.uid || this.generateUID();
      const eventUrl = `${calendar.url}${eventUid}.ics`;
      
      // Convert event to iCalendar format
      const icalData = this.buildICalendarEvent(eventData, config);

      const response = await this.makeRequest('PUT', eventUrl, {
        auth,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'If-None-Match': '*'
        },
        body: icalData
      });

      if (response.status === 201 || response.status === 204) {
        logger.info('Event created successfully', {
          provider: config.provider,
          calendar: calendar.name,
          eventUid
        });

        return {
          uid: eventUid,
          url: eventUrl,
          etag: response.headers.etag
        };
      }

      throw new Error(`Failed to create event: ${response.status}`);

    } catch (error) {
      logger.error('Event creation failed', error);
      throw new Error(`Failed to create event: ${error.message}`);
    }
  }

  /**
   * Update calendar event
   */
  async updateEvent(config, calendar, eventUid, eventData, etag) {
    try {
      const auth = this.getAuthFromCache(config);
      if (!auth) {
        throw new Error('Authentication required');
      }

      const eventUrl = `${calendar.url}${eventUid}.ics`;
      
      // Convert event to iCalendar format
      const icalData = this.buildICalendarEvent(eventData, config);

      const headers = {
        'Content-Type': 'text/calendar; charset=utf-8'
      };

      // Add ETag for optimistic concurrency control
      if (etag) {
        headers['If-Match'] = etag;
      }

      const response = await this.makeRequest('PUT', eventUrl, {
        auth,
        headers,
        body: icalData
      });

      if (response.status === 204 || response.status === 200) {
        logger.info('Event updated successfully', {
          provider: config.provider,
          calendar: calendar.name,
          eventUid
        });

        return {
          uid: eventUid,
          url: eventUrl,
          etag: response.headers.etag
        };
      }

      throw new Error(`Failed to update event: ${response.status}`);

    } catch (error) {
      logger.error('Event update failed', error);
      throw new Error(`Failed to update event: ${error.message}`);
    }
  }

  /**
   * Delete calendar event
   */
  async deleteEvent(config, calendar, eventUid, etag) {
    try {
      const auth = this.getAuthFromCache(config);
      if (!auth) {
        throw new Error('Authentication required');
      }

      const eventUrl = `${calendar.url}${eventUid}.ics`;

      const headers = {};
      if (etag) {
        headers['If-Match'] = etag;
      }

      const response = await this.makeRequest('DELETE', eventUrl, {
        auth,
        headers
      });

      if (response.status === 204 || response.status === 200) {
        logger.info('Event deleted successfully', {
          provider: config.provider,
          calendar: calendar.name,
          eventUid
        });

        return true;
      }

      throw new Error(`Failed to delete event: ${response.status}`);

    } catch (error) {
      logger.error('Event deletion failed', error);
      throw new Error(`Failed to delete event: ${error.message}`);
    }
  }

  /**
   * Perform sync-collection based incremental sync
   */
  async performSyncCollectionSync(config, calendar, syncToken, auth) {
    const syncUrl = `${calendar.url}?sync-collection`;
    
    const response = await this.makeRequest('REPORT', syncUrl, {
      auth,
      headers: {
        'Content-Type': 'application/xml',
        'Depth': '1'
      },
      body: this.buildSyncCollectionXML(syncToken)
    });

    const parsed = this.xmlParser.parse(response.data);
    return this.parseSyncCollectionResponse(parsed);
  }

  /**
   * Perform full calendar sync
   */
  async performFullSync(config, calendar, auth) {
    const response = await this.makeRequest('REPORT', calendar.url, {
      auth,
      headers: {
        'Content-Type': 'application/xml',
        'Depth': '1'
      },
      body: this.buildCalendarQueryXML()
    });

    const parsed = this.xmlParser.parse(response.data);
    return this.parseCalendarQueryResponse(parsed);
  }

  /**
   * Parse calendar list from PROPFIND response
   */
  parseCalendarList(parsed, config) {
    const calendars = [];
    const responses = this.ensureArray(parsed.multistatus?.response || []);

    for (const response of responses) {
      const props = response.propstat?.prop;
      if (!props) continue;

      const resourceType = props.resourcetype;
      const isCalendar = resourceType?.collection && resourceType?.calendar;
      
      if (isCalendar) {
        const calendar = {
          url: this.resolveUrl(config.serverUrl, response.href),
          name: props.displayname || 'Unnamed Calendar',
          description: props['calendar-description'] || '',
          color: props['calendar-color'] || null,
          readOnly: false,
          components: this.parseComponentSet(props['supported-calendar-component-set'])
        };

        calendars.push(calendar);
      }
    }

    return calendars;
  }

  /**
   * Normalize event data from CalDAV
   */
  normalizeEvent(rawEvent, config) {
    try {
      // Parse iCalendar data
      const parsed = ical.parseICS(rawEvent.icalData);
      const event = Object.values(parsed)[0];

      if (!event) {
        throw new Error('No event data found');
      }

      // Convert to PharmaDOC format
      return {
        uid: event.uid,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        startTime: this.timezoneService.convertToUTC(event.start),
        endTime: this.timezoneService.convertToUTC(event.end),
        allDay: event.start && !event.start.getHours && !event.start.getMinutes,
        location: event.location || '',
        status: this.mapEventStatus(event.status),
        attendees: this.parseAttendees(event.attendee),
        organizer: this.parseOrganizer(event.organizer),
        recurrence: this.parseRecurrence(event.rrule),
        timezone: event.start?.tz || config.defaultTimezone || 'UTC',
        etag: rawEvent.etag,
        lastModified: event.lastmodified || new Date(),
        provider: config.provider,
        calendarId: rawEvent.calendarId
      };

    } catch (error) {
      logger.error('Event normalization failed', error);
      throw new Error(`Failed to normalize event: ${error.message}`);
    }
  }

  /**
   * Build iCalendar event data
   */
  buildICalendarEvent(eventData, config) {
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    let ical = 'BEGIN:VCALENDAR\r\n';
    ical += 'VERSION:2.0\r\n';
    ical += 'PRODID:-//PharmaDOC//Calendar Integration//EN\r\n';
    ical += 'BEGIN:VEVENT\r\n';
    ical += `UID:${eventData.uid}\r\n`;
    ical += `DTSTAMP:${now}\r\n`;
    ical += `CREATED:${now}\r\n`;
    ical += `LAST-MODIFIED:${now}\r\n`;
    ical += `SUMMARY:${this.escapeICalValue(eventData.title)}\r\n`;
    
    if (eventData.description) {
      ical += `DESCRIPTION:${this.escapeICalValue(eventData.description)}\r\n`;
    }
    
    if (eventData.location) {
      ical += `LOCATION:${this.escapeICalValue(eventData.location)}\r\n`;
    }

    // Add start and end times
    const startTime = this.formatICalDateTime(eventData.startTime, eventData.allDay);
    const endTime = this.formatICalDateTime(eventData.endTime, eventData.allDay);
    
    ical += `DTSTART:${startTime}\r\n`;
    ical += `DTEND:${endTime}\r\n`;

    // Add organizer
    if (eventData.organizer) {
      ical += `ORGANIZER:mailto:${eventData.organizer.email}\r\n`;
    }

    // Add attendees
    if (eventData.attendees && eventData.attendees.length > 0) {
      for (const attendee of eventData.attendees) {
        ical += `ATTENDEE;RSVP=TRUE:mailto:${attendee.email}\r\n`;
      }
    }

    // Add status
    if (eventData.status) {
      ical += `STATUS:${eventData.status.toUpperCase()}\r\n`;
    }

    ical += 'END:VEVENT\r\n';
    ical += 'END:VCALENDAR\r\n';

    return ical;
  }

  /**
   * Utility methods
   */
  
  buildPropfindXML(properties) {
    const propElements = properties.map(prop => ({ [prop]: '' }));
    
    return this.xmlBuilder.build({
      propfind: {
        '@_xmlns': 'DAV:',
        '@_xmlns:C': 'urn:ietf:params:xml:ns:caldav',
        prop: Object.assign({}, ...propElements)
      }
    });
  }

  buildCalendarQueryXML(timeRange = null) {
    const query = {
      'calendar-query': {
        '@_xmlns:C': 'urn:ietf:params:xml:ns:caldav',
        '@_xmlns': 'DAV:',
        prop: {
          getetag: '',
          'calendar-data': ''
        },
        filter: {
          'comp-filter': {
            '@_name': 'VCALENDAR',
            'comp-filter': {
              '@_name': 'VEVENT'
            }
          }
        }
      }
    };

    return this.xmlBuilder.build(query);
  }

  buildSyncCollectionXML(syncToken) {
    return this.xmlBuilder.build({
      'sync-collection': {
        '@_xmlns': 'DAV:',
        'sync-token': syncToken,
        'sync-level': '1',
        prop: {
          getetag: '',
          'calendar-data': ''
        }
      }
    });
  }

  async makeRequest(method, url, options = {}) {
    const config = {
      method,
      url,
      timeout: this.config.timeout,
      ...options
    };

    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await axios(config);
      } catch (error) {
        lastError = error;
        
        if (attempt < this.config.retryAttempts && this.isRetryableError(error)) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
          continue;
        }
        
        break;
      }
    }

    throw lastError;
  }

  isRetryableError(error) {
    if (!error.response) return true; // Network error
    
    const status = error.response.status;
    return status >= 500 || status === 429 || status === 408;
  }

  getAuthFromCache(config) {
    const authKey = `${config.provider}:${config.username}`;
    const cached = this.authCache.get(authKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      return {
        username: cached.username,
        password: cached.password
      };
    }
    
    return null;
  }

  generateUID() {
    return crypto.randomUUID();
  }

  generateSyncToken(config, calendar) {
    return `${config.provider}-${calendar.name}-${Date.now()}`;
  }

  resolveUrl(base, relative) {
    return new URL(relative, base).toString();
  }

  ensureArray(value) {
    return Array.isArray(value) ? value : [value];
  }

  extractProperty(parsed, propertyName) {
    // Extract property from parsed CalDAV response
    return parsed?.multistatus?.response?.[0]?.propstat?.prop?.[propertyName];
  }

  parseComponentSet(componentSet) {
    if (!componentSet) return ['VEVENT'];
    // Parse supported calendar components
    return ['VEVENT']; // Simplified
  }

  mapEventStatus(status) {
    const statusMap = {
      'CONFIRMED': 'confirmed',
      'TENTATIVE': 'tentative',
      'CANCELLED': 'cancelled'
    };
    return statusMap[status] || 'confirmed';
  }

  parseAttendees(attendees) {
    if (!attendees) return [];
    return this.ensureArray(attendees).map(attendee => ({
      email: attendee.val || attendee,
      name: attendee.params?.CN || attendee.val || attendee,
      status: attendee.params?.PARTSTAT || 'NEEDS-ACTION'
    }));
  }

  parseOrganizer(organizer) {
    if (!organizer) return null;
    return {
      email: organizer.val || organizer,
      name: organizer.params?.CN || organizer.val || organizer
    };
  }

  parseRecurrence(rrule) {
    // Parse RRULE - simplified implementation
    return rrule ? { rule: rrule.toString() } : null;
  }

  escapeICalValue(value) {
    if (!value) return '';
    return value.toString()
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  formatICalDateTime(date, allDay = false) {
    const d = new Date(date);
    if (allDay) {
      return d.toISOString().split('T')[0].replace(/-/g, '');
    }
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { CalDAVClient }; 