function getOrderingState(now) {
  // Rules (as requested):
  // - Students can order morning up to 10:00 for afternoon foods.
  // - After 10:00, order button disabled.
  // - After 14:00 (2pm), order button enabled again for evening snacks.
  const h = now.getHours();
  const m = now.getMinutes();
  const minutes = h * 60 + m;

  const cutoff10 = 10 * 60;
  const enable2pm = 14 * 60;

  if (minutes < cutoff10) {
    return {
      isOrderingOpen: true,
      window: "afternoon",
      reason: "Afternoon ordering is open until 10:00 AM.",
      label: "Afternoon ordering (open)",
    };
  }

  if (minutes >= cutoff10 && minutes < enable2pm) {
    return {
      isOrderingOpen: false,
      window: "closed",
      reason: "Ordering is closed between 10:00 AM and 2:00 PM.",
      label: "Ordering closed (10 AM – 2 PM)",
    };
  }

  return {
    isOrderingOpen: true,
    window: "evening",
    reason: "Evening ordering is open after 2:00 PM.",
    label: "Evening ordering (open)",
  };
}

module.exports = { getOrderingState };

