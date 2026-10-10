export const RouteDeviationService = {
  /**
   * Compares planned route against actual driver GPS pings.
   * Currently NOT IMPLEMENTED due to lack of high-frequency GPS ping infrastructure in the TrustRide app.
   * Returns null to avoid fabricating deviation events.
   */
  detectDeviation: (plannedRoute, actualPings) => {
    // Boundary established for Phase 4.
    // Logic: calculate Haversine distance from actual points to the nearest polyline segment of planned route.
    return null; // NOT IMPLEMENTED
  }
};
