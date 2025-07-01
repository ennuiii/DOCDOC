import React, { useState, useEffect } from 'react';
import { X, Clock, AlertTriangle, CheckCircle, XCircle, ArrowRight, MapPin, Brain, Zap, TrendingUp, Navigation } from 'lucide-react';

const ConflictResolutionModal = ({ isOpen, onClose, conflicts, eventData, onResolve }) => {
    const [selectedResolution, setSelectedResolution] = useState(null);
    const [processingConflict, setProcessingConflict] = useState(null);
    const [expandedConflict, setExpandedConflict] = useState(null);
    const [smartSuggestions, setSmartSuggestions] = useState([]);
    const [travelWarnings, setTravelWarnings] = useState([]);
    const [userPreferences, setUserPreferences] = useState(null);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    // Load smart features when modal opens
    useEffect(() => {
        if (isOpen && conflicts?.length > 0) {
            loadSmartFeatures();
        }
    }, [isOpen, conflicts]);

    const loadSmartFeatures = async () => {
        setLoadingSuggestions(true);
        try {
            // Fetch travel time warnings
            const travelResponse = await fetch('/api/smart-conflict/travel-warnings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    conflicts, 
                    eventData,
                    currentEvents: conflicts.map(c => c.conflictingItem) 
                })
            });
            
            if (travelResponse.ok) {
                const travelData = await travelResponse.json();
                setTravelWarnings(travelData.warnings || []);
            }

            // Fetch smart alternative suggestions
            const suggestionsResponse = await fetch('/api/smart-conflict/alternative-suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    conflicts, 
                    eventData,
                    participantAvailability: true,
                    includeTravelTime: true
                })
            });
            
            if (suggestionsResponse.ok) {
                const suggestionsData = await suggestionsResponse.json();
                setSmartSuggestions(suggestionsData.suggestions || []);
            }

            // Fetch user preferences and learning insights
            const preferencesResponse = await fetch('/api/smart-conflict/user-preferences');
            if (preferencesResponse.ok) {
                const preferencesData = await preferencesResponse.json();
                setUserPreferences(preferencesData.preferences);
            }

        } catch (error) {
            console.error('Failed to load smart features:', error);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    // Group conflicts by type for better organization
    const conflictsByType = conflicts?.reduce((acc, conflict, index) => {
        const type = conflict.type;
        if (!acc[type]) {
            acc[type] = [];
        }
        acc[type].push({ ...conflict, index });
        return acc;
    }, {}) || {};

    // Enhanced severity colors with smart indicators
    const getSeverityColor = (severity, hasSmartSolution = false) => {
        const baseColor = (() => {
            switch (severity) {
                case 'critical': return 'bg-red-100 border-red-300 text-red-800';
                case 'high': return 'bg-orange-100 border-orange-300 text-orange-800';
                case 'medium': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
                case 'low': return 'bg-blue-100 border-blue-300 text-blue-800';
                default: return 'bg-gray-100 border-gray-300 text-gray-800';
            }
        })();
        
        return hasSmartSolution ? `${baseColor} ring-2 ring-green-200` : baseColor;
    };

    // Get enhanced conflict type icon with smart indicators
    const getConflictIcon = (type, hasTravel = false, hasSmartSolution = false) => {
        const baseIcon = (() => {
            switch (type) {
                case 'time_overlap': return <Clock className="w-5 h-5" />;
                case 'buffer_violation': return <ArrowRight className="w-5 h-5" />;
                case 'venue_conflict': return <AlertTriangle className="w-5 h-5" />;
                case 'double_booking': return <XCircle className="w-5 h-5" />;
                case 'travel_impossible': return <Navigation className="w-5 h-5 text-red-600" />;
                default: return <AlertTriangle className="w-5 h-5" />;
            }
        })();

        return (
            <div className="relative">
                {baseIcon}
                {hasSmartSolution && (
                    <Brain className="w-3 h-3 text-green-600 absolute -top-1 -right-1" />
                )}
                {hasTravel && (
                    <MapPin className="w-3 h-3 text-orange-600 absolute -bottom-1 -right-1" />
                )}
            </div>
        );
    };

    // Format conflict type for display
    const formatConflictType = (type) => {
        const formatted = type.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        
        if (type === 'travel_impossible') {
            return `${formatted} ⚡ Smart Travel Analysis`;
        }
        
        return formatted;
    };

    // Enhanced resolution handler with smart features
    const handleResolutionSelect = async (conflictIndex, resolution) => {
        setProcessingConflict(conflictIndex);
        setSelectedResolution({ conflictIndex, resolution });

        try {
            // Record user preference for learning
            if (userPreferences && resolution.learnFromChoice) {
                await fetch('/api/smart-conflict/record-preference', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conflictType: conflicts[conflictIndex].type,
                        resolution: resolution.type,
                        context: {
                            timeOfDay: new Date().getHours(),
                            dayOfWeek: new Date().getDay(),
                            meetingType: eventData?.meeting_type,
                            hasTravel: resolution.hasTravel
                        }
                    })
                });
            }

            await onResolve(conflicts[conflictIndex], resolution);
            
            // Auto-close if all conflicts are resolved
            const remainingConflicts = conflicts.filter((_, index) => index !== conflictIndex);
            if (remainingConflicts.length === 0) {
                setTimeout(() => onClose(), 1500);
            }
        } catch (error) {
            console.error('Failed to resolve conflict:', error);
        } finally {
            setProcessingConflict(null);
        }
    };

    // Smart auto-resolve all conflicts
    const handleSmartAutoResolve = async () => {
        try {
            const response = await fetch('/api/smart-conflict/auto-resolve-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    conflicts, 
                    eventData,
                    userPreferences,
                    enableTravelOptimization: true,
                    learnFromResolutions: true
                })
            });

            if (response.ok) {
                const resolutions = await response.json();
                for (const resolution of resolutions.results) {
                    await onResolve(resolution.conflict, resolution.solution);
                }
                setTimeout(() => onClose(), 1000);
            }
        } catch (error) {
            console.error('Failed to auto-resolve conflicts:', error);
        }
    };

    // Format time for display
    const formatTime = (timeString) => {
        if (!timeString) return 'N/A';
        const date = new Date(timeString);
        return date.toLocaleString();
    };

    // Calculate overlap duration display
    const formatOverlapDuration = (minutes) => {
        if (minutes < 60) {
            return `${Math.round(minutes)} minutes`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        return `${hours}h ${remainingMinutes}m`;
    };

    // Check if conflict has smart solutions
    const hasSmartSolution = (conflictIndex) => {
        return smartSuggestions.some(s => s.conflictIndex === conflictIndex);
    };

    // Check if conflict involves travel
    const hasTravel = (conflict) => {
        return travelWarnings.some(w => w.conflictIndex === conflict.index) || 
               conflict.type === 'travel_impossible';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[95vh] overflow-hidden">
                {/* Enhanced Header with Smart Features */}
                <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-red-50 to-orange-50">
                    <div>
                        <h2 className="text-xl font-semibold text-red-800 flex items-center gap-2">
                            <AlertTriangle className="w-6 h-6" />
                            Smart Conflict Resolution
                            <Brain className="w-5 h-5 text-green-600" />
                        </h2>
                        <p className="text-red-600 mt-1">
                            {conflicts?.length || 0} conflict(s) found for "{eventData?.summary || eventData?.purpose || 'Event'}"
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                            {smartSuggestions.length > 0 && (
                                <span className="flex items-center gap-1 text-green-700">
                                    <Zap className="w-4 h-4" />
                                    {smartSuggestions.length} Smart Solutions
                                </span>
                            )}
                            {travelWarnings.length > 0 && (
                                <span className="flex items-center gap-1 text-orange-700">
                                    <MapPin className="w-4 h-4" />
                                    {travelWarnings.length} Travel Warnings
                                </span>
                            )}
                            {userPreferences && (
                                <span className="flex items-center gap-1 text-blue-700">
                                    <TrendingUp className="w-4 h-4" />
                                    Learning from {userPreferences.totalDecisions} past decisions
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Event Details */}
                <div className="p-6 border-b bg-gray-50">
                    <h3 className="font-medium text-gray-800 mb-2">Event Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-600">Title:</span>
                            <span className="ml-2 font-medium">{eventData?.summary || eventData?.purpose || 'Untitled Event'}</span>
                        </div>
                        <div>
                            <span className="text-gray-600">Time:</span>
                            <span className="ml-2">{formatTime(eventData?.start_time || eventData?.start?.dateTime)} - {formatTime(eventData?.end_time || eventData?.end?.dateTime)}</span>
                        </div>
                        {eventData?.location && (
                            <div>
                                <span className="text-gray-600">Location:</span>
                                <span className="ml-2">{eventData.location}</span>
                            </div>
                        )}
                        {eventData?.meeting_type && (
                            <div>
                                <span className="text-gray-600">Type:</span>
                                <span className="ml-2 capitalize">{eventData.meeting_type}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Conflicts List */}
                <div className="p-6 overflow-y-auto max-h-[50vh]">
                    <h3 className="font-medium text-gray-800 mb-4">Conflicts Found</h3>
                    
                    {Object.entries(conflictsByType).map(([type, typeConflicts]) => (
                        <div key={type} className="mb-6">
                            <h4 className="flex items-center gap-2 text-lg font-medium text-gray-700 mb-3">
                                {getConflictIcon(type, hasTravel(typeConflicts[0]), hasSmartSolution(typeConflicts[0].index))}
                                {formatConflictType(type)} ({typeConflicts.length})
                            </h4>
                            
                            {typeConflicts.map((conflict) => (
                                <div
                                    key={conflict.index}
                                    className={`border rounded-lg p-4 mb-3 ${getSeverityColor(conflict.severity, hasSmartSolution(conflict.index))}`}
                                >
                                    {/* Conflict Header */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium">
                                                    {conflict.conflictingItem?.title || 'Untitled'}
                                                </span>
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(conflict.severity, hasSmartSolution(conflict.index))}`}>
                                                    {conflict.severity}
                                                </span>
                                            </div>
                                            
                                            {/* Conflict Details */}
                                            <div className="text-sm space-y-1">
                                                {conflict.conflictingItem?.start_time && (
                                                    <div>
                                                        <strong>Time:</strong> {formatTime(conflict.conflictingItem.start_time)} - {formatTime(conflict.conflictingItem.end_time)}
                                                    </div>
                                                )}
                                                
                                                {conflict.overlap && (
                                                    <div>
                                                        <strong>Overlap:</strong> {formatOverlapDuration(conflict.overlap)}
                                                    </div>
                                                )}
                                                
                                                {conflict.bufferMinutes && (
                                                    <div>
                                                        <strong>Buffer Violation:</strong> {conflict.bufferMinutes} minutes {conflict.bufferType}
                                                    </div>
                                                )}

                                                {/* Travel Time Warning */}
                                                {travelWarnings.find(w => w.conflictIndex === conflict.index) && (
                                                    <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded mt-2">
                                                        <Navigation className="w-4 h-4 text-orange-600" />
                                                        <div>
                                                            <strong className="text-orange-800">Travel Warning:</strong>
                                                            <span className="text-orange-700 ml-1">
                                                                {travelWarnings.find(w => w.conflictIndex === conflict.index)?.message}
                                                            </span>
                                                            {travelWarnings.find(w => w.conflictIndex === conflict.index)?.estimatedTravelTime && (
                                                                <span className="text-orange-600 text-xs block">
                                                                    Estimated travel: {travelWarnings.find(w => w.conflictIndex === conflict.index).estimatedTravelTime} minutes
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Smart Solution Available */}
                                                {hasSmartSolution(conflict.index) && (
                                                    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded mt-2">
                                                        <Brain className="w-4 h-4 text-green-600" />
                                                        <div>
                                                            <strong className="text-green-800">Smart Solution Available:</strong>
                                                            <span className="text-green-700 ml-1">
                                                                AI has found {smartSuggestions.filter(s => s.conflictIndex === conflict.index).length} alternative(s)
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* User Preference Insight */}
                                                {userPreferences && userPreferences.patterns?.[conflict.type] && (
                                                    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded mt-2">
                                                        <TrendingUp className="w-4 h-4 text-blue-600" />
                                                        <div>
                                                            <strong className="text-blue-800">Based on your preferences:</strong>
                                                            <span className="text-blue-700 ml-1">
                                                                You usually {userPreferences.patterns[conflict.type].preferredAction} in similar situations 
                                                                ({Math.round(userPreferences.patterns[conflict.type].confidence * 100)}% confidence)
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {conflict.conflictingItem?.participants && (
                                                    <div>
                                                        <strong>Participants:</strong> {conflict.conflictingItem.participants.map(p => p?.name || p?.email).filter(Boolean).join(', ')}
                                                    </div>
                                                )}
                                                
                                                {conflict.conflictingItem?.type === 'multiple' && (
                                                    <div>
                                                        <strong>Multiple Conflicts:</strong> {conflict.conflictingItem.count} overlapping events
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <button
                                            onClick={() => setExpandedConflict(expandedConflict === conflict.index ? null : conflict.index)}
                                            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                        >
                                            {expandedConflict === conflict.index ? 'Hide Options' : 'View Options'}
                                            {hasSmartSolution(conflict.index) && <Zap className="w-3 h-3 text-green-600" />}
                                        </button>
                                    </div>

                                    {/* Enhanced Resolution Options with Smart Suggestions */}
                                    {expandedConflict === conflict.index && (
                                        <div className="border-t pt-3 mt-3">
                                            {/* Smart Suggestions Section */}
                                            {smartSuggestions.filter(s => s.conflictIndex === conflict.index).length > 0 && (
                                                <div className="mb-4">
                                                    <h5 className="font-medium text-green-700 mb-2 flex items-center gap-2">
                                                        <Brain className="w-4 h-4" />
                                                        AI-Powered Smart Suggestions
                                                    </h5>
                                                    <div className="space-y-2">
                                                        {smartSuggestions.filter(s => s.conflictIndex === conflict.index).map((suggestion, sugIndex) => (
                                                            <button
                                                                key={`smart-${sugIndex}`}
                                                                onClick={() => handleResolutionSelect(conflict.index, { 
                                                                    ...suggestion, 
                                                                    learnFromChoice: true,
                                                                    type: 'smart_suggestion' 
                                                                })}
                                                                disabled={processingConflict === conflict.index}
                                                                className={`w-full text-left p-3 rounded border transition-colors ${
                                                                    processingConflict === conflict.index
                                                                        ? 'bg-gray-100 cursor-not-allowed'
                                                                        : 'bg-green-50 hover:bg-green-100 border-green-200 hover:border-green-300'
                                                                }`}
                                                            >
                                                                <div className="flex justify-between items-start">
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <Brain className="w-4 h-4 text-green-600" />
                                                                            <span className="font-medium text-green-800">{suggestion.title}</span>
                                                                            <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                                                                                AI Recommended
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-sm text-green-700 mt-1">{suggestion.description}</div>
                                                                        
                                                                        {/* Smart Features */}
                                                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                                                            <span className={`px-2 py-1 rounded text-xs ${
                                                                                suggestion.impact === 'low' ? 'bg-green-100 text-green-800' :
                                                                                suggestion.impact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                                                'bg-red-100 text-red-800'
                                                                            }`}>
                                                                                {suggestion.impact} impact
                                                                            </span>
                                                                            
                                                                            {suggestion.confidence && (
                                                                                <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                                                                    {Math.round(suggestion.confidence * 100)}% confidence
                                                                                </span>
                                                                            )}
                                                                            
                                                                            {suggestion.travelOptimized && (
                                                                                <span className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-800 flex items-center gap-1">
                                                                                    <MapPin className="w-3 h-3" />
                                                                                    Travel Optimized
                                                                                </span>
                                                                            )}
                                                                            
                                                                            {suggestion.learningBased && (
                                                                                <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800 flex items-center gap-1">
                                                                                    <TrendingUp className="w-3 h-3" />
                                                                                    Based on Preferences
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        {/* Alternative Time Slots */}
                                                                        {suggestion.alternativeSlots && suggestion.alternativeSlots.length > 0 && (
                                                                            <div className="mt-2 p-2 bg-white border border-green-200 rounded">
                                                                                <div className="text-xs font-medium text-green-800 mb-1">Alternative Time Slots:</div>
                                                                                <div className="text-xs text-green-700 space-y-1">
                                                                                    {suggestion.alternativeSlots.slice(0, 3).map((slot, slotIndex) => (
                                                                                        <div key={slotIndex} className="flex justify-between">
                                                                                            <span>{formatTime(slot.start)} - {formatTime(slot.end)}</span>
                                                                                            <span className="text-green-600">
                                                                                                Score: {Math.round(slot.score * 100)}%
                                                                                            </span>
                                                                                        </div>
                                                                                    ))}
                                                                                    {suggestion.alternativeSlots.length > 3 && (
                                                                                        <div className="text-green-600">
                                                                                            +{suggestion.alternativeSlots.length - 3} more options available
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {processingConflict === conflict.index ? (
                                                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                                                                    ) : (
                                                                        <Zap className="w-5 h-5 text-green-600" />
                                                                    )}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Standard Resolution Options */}
                                            {conflict.resolutionSuggestions && (
                                                <div>
                                                    <h5 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                                                        <CheckCircle className="w-4 h-4" />
                                                        Standard Resolution Options
                                                    </h5>
                                                    <div className="space-y-2">
                                                        {conflict.resolutionSuggestions.map((suggestion, sugIndex) => (
                                                            <button
                                                                key={`standard-${sugIndex}`}
                                                                onClick={() => handleResolutionSelect(conflict.index, suggestion)}
                                                                disabled={processingConflict === conflict.index}
                                                                className={`w-full text-left p-3 rounded border transition-colors ${
                                                                    processingConflict === conflict.index
                                                                        ? 'bg-gray-100 cursor-not-allowed'
                                                                        : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300'
                                                                }`}
                                                            >
                                                                <div className="flex justify-between items-start">
                                                                    <div>
                                                                        <div className="font-medium text-gray-800">{suggestion.title}</div>
                                                                        <div className="text-sm text-gray-600 mt-1">{suggestion.description}</div>
                                                                        <div className="flex items-center gap-2 mt-2">
                                                                            <span className={`px-2 py-1 rounded text-xs ${
                                                                                suggestion.impact === 'low' ? 'bg-green-100 text-green-800' :
                                                                                suggestion.impact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                                                'bg-red-100 text-red-800'
                                                                            }`}>
                                                                                {suggestion.impact} impact
                                                                            </span>
                                                                            {suggestion.automated && (
                                                                                <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                                                                    Auto-resolvable
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {processingConflict === conflict.index ? (
                                                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                                                                    ) : (
                                                                        <ArrowRight className="w-5 h-5 text-gray-400" />
                                                                    )}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Enhanced Footer with Smart Auto-Resolve */}
                <div className="flex justify-between items-center p-6 border-t bg-gradient-to-r from-gray-50 to-blue-50">
                    <div className="text-sm text-gray-600">
                        <div className="flex items-center gap-2 mb-1">
                            <Brain className="w-4 h-4 text-blue-600" />
                            Smart Resolution Available
                        </div>
                        <div className="text-xs text-gray-500">
                            {smartSuggestions.length > 0 && `${smartSuggestions.length} AI suggestions • `}
                            {travelWarnings.length > 0 && `${travelWarnings.length} travel optimizations • `}
                            {userPreferences ? `Learning from ${userPreferences.totalDecisions} decisions` : 'Building preference profile'}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        {smartSuggestions.length > 0 && (
                            <button
                                onClick={handleSmartAutoResolve}
                                disabled={loadingSuggestions}
                                className="px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded hover:from-green-700 hover:to-blue-700 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {loadingSuggestions ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <Zap className="w-4 h-4" />
                                )}
                                Smart Auto-Resolve All
                            </button>
                        )}
                        {!smartSuggestions.length && (
                            <button
                                onClick={handleSmartAutoResolve}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                <Brain className="w-4 h-4" />
                                Auto-Resolve All
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConflictResolutionModal;
