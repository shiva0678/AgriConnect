import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AgriConnect API',
      version: '1.0.0',
      description: 'AgriConnect backend API documentation for health and authentication endpoints.',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local development server',
      },
    ],
  },
  apis: ['./routes/*.js', './controllers/*.js', './server.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
