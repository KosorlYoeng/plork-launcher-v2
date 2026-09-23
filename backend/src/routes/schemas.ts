export const channelQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      channel: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;
