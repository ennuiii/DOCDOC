/**
 * Travel Time Calculation Engine
 * Calculates travel times for hybrid meetings to prevent impossible scheduling
 */

const { createClient } = require('@supabase/supabase-js');

class TravelTimeCalculationService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Default travel times by mode (in minutes)
        this.defaultTravelTimes = {
            walking: { baseTime: 15, speedKmh: 5 },
            driving: { baseTime: 10, speedKmh: 30 },
            publicTransport: { baseTime: 20, speedKmh: 25 },
            taxi: { baseTime: 8, speedKmh: 35 }
        };

        // Traffic multipliers by time of day
        this.trafficMultipliers = {
            '0-6': 1.0,    // Night/early morning
            '6-9': 1.8,    // Morning rush
            '9-16': 1.2,   // Daytime
            '16-19': 1.7,  // Evening rush
            '19-24': 1.1   // Evening
        };
    }

    /**
     * Calculate travel time between two appointments
     * @param {Object} fromAppointment - Starting appointment
     * @param {Object} toAppointment - Destination appointment
     * @param {Object} options - Calculation options
     */
    async calculateTravelTime(fromAppointment, toAppointment, options = {}) {
        try {
            // Extract locations
            const fromLocation = this.extractLocation(fromAppointment);
            const toLocation = this.extractLocation(toAppointment);

            // If both are virtual, no travel time needed
            if (fromLocation.type === 'virtual' && toLocation.type === 'virtual') {
                return { travelTimeMinutes: 0, transportMode: 'none', confidence: 1.0 };
            }

            // If transitioning from virtual to physical or vice versa
            if (fromLocation.type === 'virtual' || toLocation.type === 'virtual') {
                return this.calculateVirtualTransitionTime(fromLocation, toLocation, options);
            }

            // Calculate physical-to-physical travel time
            return await this.calculatePhysicalTravelTime(fromLocation, toLocation, options);

        } catch (error) {
            console.error('Error calculating travel time:', error);
            return { 
                travelTimeMinutes: 30, // Safe default
                transportMode: 'unknown',
                confidence: 0.1,
                error: error.message
            };
        }
    }

    /**
     * Extract location information from appointment
     * @param {Object} appointment - Appointment object
     */
    extractLocation(appointment) {
        // Check if it's a virtual meeting
        if (appointment.meeting_type === 'virtual' || 
            appointment.meeting_type === 'telemedicine' ||
            appointment.meeting_url) {
            return { type: 'virtual', address: null };
        }

        // Extract physical location
        const location = appointment.location || appointment.office_address || '';
        
        return {
            type: 'physical',
            address: location,
            coordinates: appointment.coordinates || null,
            venue: appointment.venue || null
        };
    }

    /**
     * Calculate transition time from virtual to physical meeting or vice versa
     * @param {Object} fromLocation - From location
     * @param {Object} toLocation - To location
     * @param {Object} options - Options
     */
    calculateVirtualTransitionTime(fromLocation, toLocation, options = {}) {
        // Time needed to properly end virtual meeting and travel to physical location
        const baseTransitionTime = 15; // 15 minutes to wrap up virtual and prepare for travel
        
        let travelTime = baseTransitionTime;
        let transportMode = 'transition';

        if (fromLocation.type === 'virtual' && toLocation.type === 'physical') {
            // Virtual to physical: need travel time to destination
            const estimatedTravel = this.estimateTravelTimeFromUserLocation(
                toLocation.address, 
                options.userLocation || 'office'
            );
            travelTime += estimatedTravel.minutes;
            transportMode = estimatedTravel.mode;
        } else if (fromLocation.type === 'physical' && toLocation.type === 'virtual') {
            // Physical to virtual: just need time to get to computer/setup
            travelTime = 10; // 10 minutes to get to virtual meeting setup
            transportMode = 'setup';
        }

        return {
            travelTimeMinutes: travelTime,
            transportMode: transportMode,
            confidence: 0.7,
            reasoning: 'Virtual-physical transition calculated'
        };
    }

    /**
     * Calculate travel time between two physical locations
     * @param {Object} fromLocation - From location
     * @param {Object} toLocation - To location
     * @param {Object} options - Options
     */
    async calculatePhysicalTravelTime(fromLocation, toLocation, options = {}) {
        // If same location or very similar addresses
        if (this.isSameLocation(fromLocation.address, toLocation.address)) {
            return {
                travelTimeMinutes: 5, // Just transition time within same building
                transportMode: 'walking',
                confidence: 0.9,
                reasoning: 'Same location detected'
            };
        }

        // Try to get stored travel time from cache
        const cachedTime = await this.getCachedTravelTime(fromLocation, toLocation);
        if (cachedTime) {
            return cachedTime;
        }

        // Calculate travel time based on distance and mode
        const distance = await this.estimateDistance(fromLocation, toLocation);
        const preferredMode = options.transportMode || 'driving';
        const travelTime = this.calculateTimeByMode(distance, preferredMode, options);

        // Cache result for future use
        await this.cacheTravelTime(fromLocation, toLocation, travelTime);

        return travelTime;
    }

    /**
     * Check if two locations are the same
     * @param {string} address1 - First address
     * @param {string} address2 - Second address
     */
    isSameLocation(address1, address2) {
        if (!address1 || !address2) return false;
        
        // Simple similarity check
        const normalized1 = address1.toLowerCase().replace(/\s+/g, ' ').trim();
        const normalized2 = address2.toLowerCase().replace(/\s+/g, ' ').trim();
        
        return normalized1 === normalized2 || 
               normalized1.includes(normalized2) || 
               normalized2.includes(normalized1);
    }

    /**
     * Estimate distance between two locations
     * @param {Object} fromLocation - From location
     * @param {Object} toLocation - To location
     */
    async estimateDistance(fromLocation, toLocation) {
        // If we have coordinates, use them
        if (fromLocation.coordinates && toLocation.coordinates) {
            return this.calculateHaversineDistance(
                fromLocation.coordinates,
                toLocation.coordinates
            );
        }

        // Otherwise, estimate based on address parsing
        return this.estimateDistanceFromAddresses(
            fromLocation.address,
            toLocation.address
        );
    }

    /**
     * Calculate haversine distance between coordinates
     * @param {Object} coord1 - {lat, lng}
     * @param {Object} coord2 - {lat, lng}
     */
    calculateHaversineDistance(coord1, coord2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.deg2rad(coord2.lat - coord1.lat);
        const dLon = this.deg2rad(coord2.lng - coord1.lng);
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                 Math.cos(this.deg2rad(coord1.lat)) * Math.cos(this.deg2rad(coord2.lat)) *
                 Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // Distance in km
    }

    deg2rad(deg) {
        return deg * (Math.PI/180);
    }

    /**
     * Estimate distance from address strings
     * @param {string} address1 - First address
     * @param {string} address2 - Second address
     */
    estimateDistanceFromAddresses(address1, address2) {
        // Simple heuristic based on address similarity
        if (!address1 || !address2) return 10; // Default 10km

        // Check if they're in the same city/area
        const addr1Parts = address1.split(',').map(p => p.trim().toLowerCase());
        const addr2Parts = address2.split(',').map(p => p.trim().toLowerCase());

        let sameCityScore = 0;
        addr1Parts.forEach(part1 => {
            addr2Parts.forEach(part2 => {
                if (part1 === part2) sameCityScore++;
            });
        });

        // Estimate distance based on similarity
        if (sameCityScore >= 2) return 5; // Same area - 5km
        if (sameCityScore >= 1) return 15; // Same city - 15km
        return 25; // Different cities - 25km
    }

    /**
     * Calculate travel time based on distance and transport mode
     * @param {number} distanceKm - Distance in kilometers
     * @param {string} mode - Transport mode
     * @param {Object} options - Options including time of day
     */
    calculateTimeByMode(distanceKm, mode, options = {}) {
        const modeConfig = this.defaultTravelTimes[mode] || this.defaultTravelTimes.driving;
        
        // Base calculation: time = distance / speed + base time
        let travelMinutes = (distanceKm / modeConfig.speedKmh) * 60 + modeConfig.baseTime;

        // Apply traffic multiplier based on time of day
        if (options.arrivalTime) {
            const hour = new Date(options.arrivalTime).getHours();
            const multiplier = this.getTrafficMultiplier(hour);
            travelMinutes *= multiplier;
        }

        // Round up to nearest 5 minutes
        travelMinutes = Math.ceil(travelMinutes / 5) * 5;

        return {
            travelTimeMinutes: travelMinutes,
            transportMode: mode,
            confidence: 0.6,
            reasoning: \Calculated: \km via \\,
            distance: distanceKm
        };
    }

    /**
     * Get traffic multiplier for given hour
     * @param {number} hour - Hour (0-23)
     */
    getTrafficMultiplier(hour) {
        if (hour >= 0 && hour < 6) return this.trafficMultipliers['0-6'];
        if (hour >= 6 && hour < 9) return this.trafficMultipliers['6-9'];
        if (hour >= 9 && hour < 16) return this.trafficMultipliers['9-16'];
        if (hour >= 16 && hour < 19) return this.trafficMultipliers['16-19'];
        return this.trafficMultipliers['19-24'];
    }

    /**
     * Estimate travel time from user's default location
     * @param {string} destination - Destination address
     * @param {string} userLocation - User's base location
     */
    estimateTravelTimeFromUserLocation(destination, userLocation = 'office') {
        // Simple estimation - in real implementation would use user's stored locations
        const estimatedDistance = 10; // Default 10km
        const mode = 'driving';
        
        return this.calculateTimeByMode(estimatedDistance, mode);
    }

    /**
     * Get cached travel time
     * @param {Object} fromLocation - From location
     * @param {Object} toLocation - To location
     */
    async getCachedTravelTime(fromLocation, toLocation) {
        try {
            const cacheKey = this.generateCacheKey(fromLocation, toLocation);
            
            const { data } = await this.supabase
                .from('travel_time_cache')
                .select('*')
                .eq('cache_key', cacheKey)
                .gte('expires_at', new Date().toISOString())
                .single();

            if (data) {
                return {
                    travelTimeMinutes: data.travel_time_minutes,
                    transportMode: data.transport_mode,
                    confidence: data.confidence,
                    reasoning: 'Retrieved from cache',
                    cached: true
                };
            }

            return null;
        } catch (error) {
            return null; // Cache miss
        }
    }

    /**
     * Cache travel time result
     * @param {Object} fromLocation - From location
     * @param {Object} toLocation - To location
     * @param {Object} travelTime - Travel time result
     */
    async cacheTravelTime(fromLocation, toLocation, travelTime) {
        try {
            const cacheKey = this.generateCacheKey(fromLocation, toLocation);
            
            await this.supabase
                .from('travel_time_cache')
                .upsert({
                    cache_key: cacheKey,
                    from_address: fromLocation.address,
                    to_address: toLocation.address,
                    travel_time_minutes: travelTime.travelTimeMinutes,
                    transport_mode: travelTime.transportMode,
                    confidence: travelTime.confidence,
                    distance_km: travelTime.distance,
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
                });
        } catch (error) {
            console.error('Error caching travel time:', error);
        }
    }

    /**
     * Generate cache key for travel time
     * @param {Object} fromLocation - From location
     * @param {Object} toLocation - To location
     */
    generateCacheKey(fromLocation, toLocation) {
        const from = fromLocation.address || 'virtual';
        const to = toLocation.address || 'virtual';
        return \\|\\.toLowerCase().replace(/\s+/g, '_');
    }

    /**
     * Check if travel between appointments is feasible
     * @param {Object} appointment1 - First appointment
     * @param {Object} appointment2 - Second appointment
     * @param {Object} options - Check options
     */
    async isTravelFeasible(appointment1, appointment2, options = {}) {
        try {
            const travelTime = await this.calculateTravelTime(appointment1, appointment2, options);
            
            const app1End = new Date(appointment1.end_time || 
                                   \\T\\);
            const app2Start = new Date(appointment2.start_time || 
                                      \\T\\);
            
            const availableTime = (app2Start - app1End) / (1000 * 60); // minutes
            const requiredTime = travelTime.travelTimeMinutes + (options.bufferMinutes || 10);

            return {
                feasible: availableTime >= requiredTime,
                availableMinutes: availableTime,
                requiredMinutes: requiredTime,
                travelTime: travelTime,
                shortfall: Math.max(0, requiredTime - availableTime)
            };
        } catch (error) {
            console.error('Error checking travel feasibility:', error);
            return {
                feasible: false,
                error: error.message
            };
        }
    }
}

module.exports = TravelTimeCalculationService;
