export function notFoundHandler(request, response) {
  response.status(404).json({
    success: false,
    message: `Route not found: ${request.method} ${request.originalUrl}`,
  });
}

export function errorHandler(error, request, response, next) {
  console.error(error);

  const statusCode = error.status || 500;
  const message = error.message || "Internal server error";

  response.status(statusCode).json({
    success: false,
    message,
  });
}