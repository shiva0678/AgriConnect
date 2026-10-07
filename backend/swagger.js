import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AgriConnect API',
      version: '1.0.0',
      description: 'AgriConnect backend API documentation for health, authentication, and farmer crop management endpoints.',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        PriceBreakdown: {
          type: 'object',
          properties: {
            market: { type: 'string' },
            state: { type: 'string' },
            commodity: { type: 'string' },
            averageModalPrice: { type: 'number', nullable: true },
            minimumModalPrice: { type: 'number', nullable: true },
            maximumModalPrice: { type: 'number', nullable: true },
            recordCount: { type: 'integer' },
          },
          required: [
            'averageModalPrice',
            'minimumModalPrice',
            'maximumModalPrice',
            'recordCount',
          ],
        },
      },
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
