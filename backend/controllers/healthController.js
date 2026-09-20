export function getHealth(request, response) {
  response.json({
    success: true,
    message: "AgriConnect API is running",
  });
}