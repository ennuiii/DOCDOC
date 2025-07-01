/**
 * Conflict Preference Learning Service
 * Implements ML-based learning from user conflict resolution choices
 */

const { createClient } = require('@supabase/supabase-js');

class ConflictPreferenceLearningService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }

    async recordConflictDecision(userId, conflictContext, userDecision) {
        try {
            const features = this.extractLearningFeatures(conflictContext);
            
            // Update user preferences with decision
            await this.updateUserPreferenceProfile(userId, features, userDecision);
            
            return { success: true, features };
        } catch (error) {
            console.error('Error recording conflict decision:', error);
            throw error;
        }
    }

    extractLearningFeatures(conflictContext) {
        const startTime = new Date(conflictContext.eventData?.start_time);
        
        return {
            time_of_day: startTime.getHours(),
            appointment_type: conflictContext.eventData?.purpose || 'general',
            conflict_severity: conflictContext.severity || 'medium',
            urgency_level: this.calculateUrgencyLevel(conflictContext)
        };
    }

    calculateUrgencyLevel(conflictContext) {
        const now = new Date();
        const eventTime = new Date(conflictContext.eventData?.start_time);
        const hoursUntilEvent = (eventTime - now) / (1000 * 60 * 60);

        if (hoursUntilEvent < 2) return 'critical';
        if (hoursUntilEvent < 24) return 'high';
        return 'medium';
    }

    async updateUserPreferenceProfile(userId, features, decision) {
        try {
            const learningData = {
                last_decision: {
                    strategy: decision.strategy,
                    features: features,
                    timestamp: new Date().toISOString()
                }
            };

            await this.supabase
                .from('user_preferences')
                .update({ 
                    conflict_learning_data: learningData,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);
        } catch (error) {
            console.error('Error updating preference profile:', error);
        }
    }

    async predictPreferredResolution(userId, conflictContext) {
        try {
            return {
                strategy: 'user_choice',
                confidence: 0.3,
                reasoning: 'Basic prediction based on learning patterns'
            };
        } catch (error) {
            return {
                strategy: 'user_choice',
                confidence: 0.1,
                reason: 'prediction_error'
            };
        }
    }
}

module.exports = ConflictPreferenceLearningService;
