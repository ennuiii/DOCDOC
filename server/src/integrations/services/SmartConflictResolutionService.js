/**
 * Smart Conflict Resolution Integration
 * Enhances existing ConflictResolutionService with AI-powered smart features
 */

const ConflictResolutionService = require('./ConflictResolutionService');
const ConflictPreferenceLearningService = require('./ConflictPreferenceLearningService');
const TravelTimeCalculationService = require('./TravelTimeCalculationService');
const AlternativeTimeslotSuggestionService = require('./AlternativeTimeslotSuggestionService');

class SmartConflictResolutionService extends ConflictResolutionService {
    constructor() {
        super();
        
        // Initialize smart services
        this.preferenceLearning = new ConflictPreferenceLearningService();
        this.travelTimeService = new TravelTimeCalculationService();
        this.alternativeTimeslots = new AlternativeTimeslotSuggestionService();

        // Smart resolution strategies
        this.smartStrategies = {
            ...this.strategies,
            SMART_AUTOMATIC: 'smart_automatic',
            PREFERENCE_BASED: 'preference_based',
            TRAVEL_AWARE: 'travel_aware'
        };

        // Enhanced conflict analysis
        this.enhancedConflictTypes = {
            ...this.conflictTypes,
            TRAVEL_IMPOSSIBLE: 'travel_impossible',
            PREFERENCE_VIOLATION: 'preference_violation'
        };
    }

    /**
     * Enhanced conflict detection with smart features
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Detection options
     */
    async detectSmartConflicts(userId, eventData, options = {}) {
        try {
            // Run base conflict detection
            const baseConflicts = await super.detectConflicts(userId, eventData, options);

            // Add smart conflict detection
            const smartConflicts = await this.detectAdditionalSmartConflicts(userId, eventData, options);
            
            // Enhance each conflict with smart features
            const enhancedConflicts = await this.enhanceConflictsWithSmartFeatures(
                [...baseConflicts, ...smartConflicts],
                userId,
                eventData,
                options
            );

            return enhancedConflicts;

        } catch (error) {
            console.error('Error in smart conflict detection:', error);
            // Fallback to base detection
            return await super.detectConflicts(userId, eventData, options);
        }
    }

    /**
     * Detect additional smart conflicts
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async detectAdditionalSmartConflicts(userId, eventData, options = {}) {
        const smartConflicts = [];

        // Travel impossibility conflicts
        const travelConflicts = await this.detectTravelImpossibilityConflicts(userId, eventData, options);
        smartConflicts.push(...travelConflicts);

        // User preference violations
        const preferenceConflicts = await this.detectPreferenceViolations(userId, eventData, options);
        smartConflicts.push(...preferenceConflicts);

        return smartConflicts;
    }

    /**
     * Detect travel impossibility conflicts
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async detectTravelImpossibilityConflicts(userId, eventData, options = {}) {
        const conflicts = [];

        try {
            // Get adjacent appointments
            const adjacentAppointments = await this.getAdjacentAppointments(userId, eventData);

            for (const adjacentAppointment of adjacentAppointments) {
                // Check if travel between appointments is feasible
                const feasibility = await this.travelTimeService.isTravelFeasible(
                    eventData,
                    adjacentAppointment,
                    { bufferMinutes: 15 }
                );

                if (!feasibility.feasible) {
                    conflicts.push({
                        type: this.enhancedConflictTypes.TRAVEL_IMPOSSIBLE,
                        severity: 'high',
                        conflictingItem: {
                            type: 'travel_constraint',
                            adjacent_appointment: adjacentAppointment,
                            travel_time_required: feasibility.requiredMinutes,
                            travel_time_available: feasibility.availableMinutes,
                            shortfall: feasibility.shortfall
                        },
                        travelAnalysis: feasibility,
                        resolutionSuggestions: await this.generateTravelAwareResolutions(
                            eventData,
                            adjacentAppointment,
                            feasibility
                        )
                    });
                }
            }

        } catch (error) {
            console.error('Error detecting travel conflicts:', error);
        }

        return conflicts;
    }

    /**
     * Detect preference violations based on learned patterns
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async detectPreferenceViolations(userId, eventData, options = {}) {
        const conflicts = [];

        try {
            // Get user learning stats
            const learningStats = await this.preferenceLearning.getUserLearningStats(userId);
            
            if (learningStats.learning_confidence < 0.3) {
                return conflicts; // Not enough data for preference analysis
            }

            // Check if proposed time violates learned preferences
            const conflictContext = {
                eventData: eventData,
                severity: 'medium',
                type: 'schedule_proposal'
            };

            const prediction = await this.preferenceLearning.predictPreferredResolution(
                userId,
                conflictContext
            );

            if (prediction.confidence > 0.6 && prediction.strategy !== 'user_choice') {
                // Strong preference exists that differs from default
                conflicts.push({
                    type: this.enhancedConflictTypes.PREFERENCE_VIOLATION,
                    severity: 'medium',
                    conflictingItem: {
                        type: 'user_preference',
                        predicted_preference: prediction.strategy,
                        confidence: prediction.confidence,
                        reasoning: prediction.reasoning
                    },
                    learningData: learningStats,
                    resolutionSuggestions: await this.generatePreferenceBasedResolutions(
                        eventData,
                        prediction,
                        learningStats
                    )
                });
            }

        } catch (error) {
            console.error('Error detecting preference violations:', error);
        }

        return conflicts;
    }

    /**
     * Enhance conflicts with smart features
     * @param {Array} conflicts - Base conflicts
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async enhanceConflictsWithSmartFeatures(conflicts, userId, eventData, options = {}) {
        const enhancedConflicts = [];

        for (const conflict of conflicts) {
            const enhanced = { ...conflict };

            // Add intelligent alternative suggestions
            enhanced.smartAlternatives = await this.generateSmartAlternatives(
                conflict,
                userId,
                eventData,
                options
            );

            // Add travel time analysis
            enhanced.travelAnalysis = await this.analyzeTravelImpact(
                conflict,
                eventData
            );

            // Add preference prediction
            enhanced.preferenceAnalysis = await this.analyzePreferenceMatch(
                conflict,
                userId,
                eventData
            );

            enhancedConflicts.push(enhanced);
        }

        return enhancedConflicts;
    }

    /**
     * Generate smart alternative suggestions
     * @param {Object} conflict - Conflict object
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     * @param {Object} options - Options
     */
    async generateSmartAlternatives(conflict, userId, eventData, options = {}) {
        try {
            // Get participants involved
            const participants = await this.getConflictParticipants(conflict, userId);

            // Generate intelligent alternatives
            const alternatives = await this.alternativeTimeslots.findAlternativeTimeslots(
                eventData,
                participants,
                {
                    maxSuggestions: 3,
                    daysAhead: 7,
                    considerTravel: true,
                    respectPreferences: true
                }
            );

            return {
                available: alternatives.suggestions.length > 0,
                suggestions: alternatives.suggestions,
                analysis: alternatives.metadata
            };

        } catch (error) {
            console.error('Error generating smart alternatives:', error);
            return { available: false, error: error.message };
        }
    }

    /**
     * Analyze travel impact for conflict
     * @param {Object} conflict - Conflict object
     * @param {Object} eventData - Event data
     */
    async analyzeTravelImpact(conflict, eventData) {
        try {
            if (!conflict.conflictingItem || conflict.conflictingItem.type === 'travel_constraint') {
                return null; // No travel analysis needed
            }

            const travelTime = await this.travelTimeService.calculateTravelTime(
                eventData,
                conflict.conflictingItem,
                { includeBuffer: true }
            );

            return {
                required_travel_time: travelTime.travelTimeMinutes,
                transport_mode: travelTime.transportMode,
                confidence: travelTime.confidence,
                feasible: travelTime.travelTimeMinutes <= 60, // Reasonable threshold
                recommendations: travelTime.travelTimeMinutes > 60 ? 
                    ['Consider virtual meeting', 'Allow more buffer time'] : []
            };

        } catch (error) {
            console.error('Error analyzing travel impact:', error);
            return null;
        }
    }

    /**
     * Analyze preference match for conflict
     * @param {Object} conflict - Conflict object
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     */
    async analyzePreferenceMatch(conflict, userId, eventData) {
        try {
            const conflictContext = {
                conflict_id: \conflict_\\,
                eventData: eventData,
                type: conflict.type,
                severity: conflict.severity
            };

            const prediction = await this.preferenceLearning.predictPreferredResolution(
                userId,
                conflictContext
            );

            return {
                predicted_strategy: prediction.strategy,
                confidence: prediction.confidence,
                reasoning: prediction.reasoning,
                alternatives: prediction.alternatives,
                recommendation: prediction.confidence > 0.7 ? 
                    \Consider \ based on your patterns\ : 
                    'Insufficient data for preference prediction'
            };

        } catch (error) {
            console.error('Error analyzing preference match:', error);
            return null;
        }
    }

    /**
     * Smart conflict resolution with automatic learning
     * @param {Array} conflicts - Conflicts to resolve
     * @param {string} strategy - Resolution strategy
     * @param {Object} userPreferences - User preferences
     * @param {string} userId - User ID
     */
    async resolveConflictsSmart(conflicts, strategy = this.smartStrategies.SMART_AUTOMATIC, userPreferences = {}, userId) {
        try {
            const resolutions = [];

            for (const conflict of conflicts) {
                let resolution;

                switch (strategy) {
                    case this.smartStrategies.SMART_AUTOMATIC:
                        resolution = await this.resolveSmartAutomatic(conflict, userPreferences, userId);
                        break;
                    case this.smartStrategies.PREFERENCE_BASED:
                        resolution = await this.resolvePreferenceBased(conflict, userPreferences, userId);
                        break;
                    case this.smartStrategies.TRAVEL_AWARE:
                        resolution = await this.resolveTravelAware(conflict, userPreferences, userId);
                        break;
                    default:
                        // Fall back to base resolution
                        resolution = await super.resolveConflicts([conflict], strategy, userPreferences);
                        resolution = resolution[0];
                }

                resolutions.push(resolution);

                // Record decision for learning (if user made a choice)
                if (resolution.userDecision && userId) {
                    await this.recordResolutionForLearning(
                        userId,
                        conflict,
                        resolution,
                        strategy
                    );
                }
            }

            return resolutions;

        } catch (error) {
            console.error('Error in smart conflict resolution:', error);
            // Fallback to base resolution
            return await super.resolveConflicts(conflicts, strategy, userPreferences);
        }
    }

    /**
     * Smart automatic resolution using all AI features
     * @param {Object} conflict - Conflict to resolve
     * @param {Object} userPreferences - User preferences
     * @param {string} userId - User ID
     */
    async resolveSmartAutomatic(conflict, userPreferences, userId) {
        // Get preference prediction
        const preferenceAnalysis = conflict.preferenceAnalysis;
        
        // Get smart alternatives
        const smartAlternatives = conflict.smartAlternatives;

        // Choose best resolution approach
        if (preferenceAnalysis?.confidence > 0.7) {
            // High confidence in user preference
            return await this.executePreferredResolution(
                conflict,
                preferenceAnalysis.predicted_strategy,
                smartAlternatives,
                userId
            );
        } else if (smartAlternatives?.available && smartAlternatives.suggestions.length > 0) {
            // Use best alternative timeslot
            return await this.executeAlternativeResolution(
                conflict,
                smartAlternatives.suggestions[0],
                userId
            );
        } else {
            // Fall back to priority-based resolution
            return await super.resolvePriorityBased(conflict, userPreferences);
        }
    }

    /**
     * Execute preferred resolution based on learning
     * @param {Object} conflict - Conflict
     * @param {string} preferredStrategy - Preferred strategy
     * @param {Object} alternatives - Alternative options
     * @param {string} userId - User ID
     */
    async executePreferredResolution(conflict, preferredStrategy, alternatives, userId) {
        return {
            strategy: preferredStrategy,
            action: 'auto_resolved',
            chosen_option: alternatives?.suggestions?.[0] || null,
            confidence: 'high',
            reasoning: \Resolved using learned preference: \\,
            auto_resolved: true,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Execute alternative timeslot resolution
     * @param {Object} conflict - Conflict
     * @param {Object} alternative - Chosen alternative
     * @param {string} userId - User ID
     */
    async executeAlternativeResolution(conflict, alternative, userId) {
        return {
            strategy: 'reschedule',
            action: 'reschedule_to_alternative',
            chosen_option: alternative,
            new_datetime: alternative.datetime,
            confidence: 'medium',
            reasoning: alternative.reasoning,
            auto_resolved: true,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Record resolution decision for learning
     * @param {string} userId - User ID
     * @param {Object} conflict - Conflict object
     * @param {Object} resolution - Resolution object
     * @param {string} strategy - Strategy used
     */
    async recordResolutionForLearning(userId, conflict, resolution, strategy) {
        try {
            const conflictContext = {
                conflict_id: \conflict_\\,
                eventData: conflict.conflictingItem,
                type: conflict.type,
                severity: conflict.severity
            };

            const userDecision = {
                strategy: strategy,
                chosen_option: resolution.chosen_option,
                action: resolution.action,
                confidence_level: resolution.confidence || 'medium',
                decision_time: Date.now()
            };

            await this.preferenceLearning.recordConflictDecision(
                userId,
                conflictContext,
                userDecision
            );

        } catch (error) {
            console.error('Error recording resolution for learning:', error);
        }
    }

    /**
     * Get adjacent appointments for travel analysis
     * @param {string} userId - User ID
     * @param {Object} eventData - Event data
     */
    async getAdjacentAppointments(userId, eventData) {
        const eventTime = new Date(eventData.start_time || eventData.start?.dateTime);
        const beforeTime = new Date(eventTime.getTime() - 4 * 60 * 60 * 1000); // 4 hours before
        const afterTime = new Date(eventTime.getTime() + 4 * 60 * 60 * 1000); // 4 hours after

        const { data: appointments } = await this.supabase
            .from('appointments')
            .select(\
                *,
                timeslots (*)
            \)
            .or(\doctor_id.eq.\,pharma_rep_id.eq.\\)
            .gte('timeslots.date', beforeTime.toISOString().split('T')[0])
            .lte('timeslots.date', afterTime.toISOString().split('T')[0])
            .neq('status', 'cancelled');

        return appointments || [];
    }

    /**
     * Get participants involved in conflict
     * @param {Object} conflict - Conflict object
     * @param {string} userId - User ID
     */
    async getConflictParticipants(conflict, userId) {
        // Extract participants from conflict data
        const participants = [];
        
        if (conflict.conflictingItem?.participants) {
            participants.push(...conflict.conflictingItem.participants);
        }

        // Add current user
        participants.push({ user_id: userId, role: 'primary' });

        return participants;
    }
}

module.exports = SmartConflictResolutionService;
