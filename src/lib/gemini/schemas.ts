// Gemini responseSchema definitions, one per document kind.
// Schemas use OpenAPI 3.0 subset that Gemini accepts (type, properties, items, required, description, nullable).

export const dlSchema = {
  type: "object",
  properties: {
    firstName: { type: "string", description: "Given/first name exactly as printed." },
    middleName: { type: "string" },
    lastName: { type: "string" },
    dob: { type: "string", description: "ISO date YYYY-MM-DD" },
    dlNumber: { type: "string", description: "Driver license number with state formatting preserved." },
    dlState: { type: "string", description: "2-letter state code. 'OH' for Ohio." },
    dlExpiration: { type: "string", description: "ISO date YYYY-MM-DD" },
    addressLine1: { type: "string" },
    addressLine2: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    zip: { type: "string" },
    sex: { type: "string" },
    height: { type: "string" },
    weight: { type: "string" },
    eyes: { type: "string" },
    issueDate: { type: "string", description: "ISO date YYYY-MM-DD" },
  },
};

export const insuranceSchema = {
  type: "object",
  properties: {
    carrier: { type: "string" },
    policyNumber: { type: "string" },
    effectiveDate: { type: "string", description: "ISO date" },
    expirationDate: { type: "string", description: "ISO date" },
    namedInsured: { type: "string" },
    vehicleVin: { type: "string" },
    vehicleYear: { type: "integer" },
    vehicleMake: { type: "string" },
    vehicleModel: { type: "string" },
  },
};

export const registrationSchema = {
  type: "object",
  properties: {
    vin: { type: "string", description: "17-character VIN, uppercase." },
    year: { type: "integer" },
    make: { type: "string" },
    model: { type: "string" },
    ownerName: { type: "string" },
    ownerAddress: { type: "string" },
    plate: { type: "string" },
    expiration: { type: "string", description: "ISO date" },
    state: { type: "string" },
  },
};

export const titleSchema = {
  type: "object",
  properties: {
    ...registrationSchema.properties,
    titleNumber: { type: "string" },
    lienHolder: { type: "string" },
  },
};

export const payoffSchema = {
  type: "object",
  properties: {
    lender: { type: "string" },
    amountCents: { type: "integer", description: "Payoff amount in cents, no currency symbol." },
    goodThroughDate: { type: "string", description: "ISO date" },
    accountNumberLast4: { type: "string", description: "Last 4 digits of account number only." },
    perDiemCents: { type: "integer", description: "Per-diem interest in cents, if present." },
    vin: { type: "string" },
  },
};

export const stockSheetSchema = {
  type: "object",
  properties: {
    vin: { type: "string" },
    year: { type: "integer" },
    make: { type: "string" },
    model: { type: "string" },
    trim: { type: "string" },
    color: { type: "string" },
    mileage: { type: "integer" },
    stockNumber: { type: "string" },
    msrpCents: { type: "integer" },
    invoiceCents: { type: "integer" },
  },
};

export const dmsScreenshotSchema = {
  type: "object",
  properties: {
    labeledFields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
        },
        required: ["label", "value"],
      },
    },
    suggested: {
      type: "object",
      properties: {
        customer: { type: "object" },
        vehicle: { type: "object" },
        trade: { type: "object" },
      },
    },
  },
  required: ["labeledFields"],
};

// AI-proposed PDF field mapping response.
export const pdfMappingSchema = {
  type: "object",
  properties: {
    mappings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pdfFieldName: { type: "string" },
          targetPath: {
            type: "string",
            description:
              "Dot path into the Deal data model. Allowed roots: primary, coBuyer, vehicle, trade, deal, insurance. Leave blank for unmapped fields.",
          },
          transform: {
            type: "string",
            description: "'none' | 'uppercase' | 'date:MM/DD/YYYY' | 'currency' | 'ssn-mask'",
          },
          confidence: { type: "number", description: "0.0 to 1.0" },
          rationale: { type: "string", description: "One-sentence reason for the mapping." },
        },
        required: ["pdfFieldName"],
      },
    },
  },
  required: ["mappings"],
};
