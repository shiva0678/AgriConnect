export function getApiErrorMessage(error, fallback) {
  const responseMessage = error?.response?.data?.message;
  if (responseMessage) return responseMessage;
  if (error?.response) {
    return "The server could not complete your request. Please try again.";
  }
  if (error?.request) {
    return "Unable to reach the server. Check your connection and try again.";
  }
  return fallback;
}