const BASE = "https://clinicaltrials.gov/api/v2";

async function run(path, params = {}) {
  const url = `${BASE}${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API Error ${res.status}: ${await res.text()}`);
  return res.json();
}

function addFields(params) {
  if (!params.fields) params.fields = [];
  for (const module of ["identificationModule", "statusModule"]) {
    const field = `protocolSection.${module}`;
    if (!params.fields.includes(field)) params.fields.push(field);
  }
  return params;
}

export const api = {
  studies: (params) => run("/studies", { pageSize: 10, ...addFields(params) }),
  study: ({ nctId }) => run(`/studies/${nctId}`),
  studiesMetadata: () => run("/studies/metadata"),
  studiesSearchAreas: () => run("/studies/search-areas"),
  studiesEnums: () => run("/studies/enums"),
  statsSize: (params) => run("/stats/size", params),
  statsFieldValues: (params) => run("/stats/field/values", params),
  statsFieldSizes: (params) => run("/stats/field/sizes", params),
};

export const tools = {
  studies: {
    name: "studies",
    description: "Search clinical trials with filters.",
    parameters: {
      type: "object",
      required: ["fields"],
      properties: {
        "query.cond": { type: "string", description: "Search for condition or disease" },
        "query.term": {
          type: "string",
          description: 'Search age, phase, design, sponsor, keyword, etc.',
        },
        "query.locn": { type: "string", description: "Search for location (country, state, city, facility)" },
        "query.titles": { type: "string", description: "Search in title" },
        "query.intr": { type: "string", description: "Search in interventions, Arm Groups" },
        "query.outc": { type: "string", description: "Search in outcome measures" },
        "query.spons": { type: "string", description: "Search sponsors / collaborators" },
        // "query.lead": { type: "string", description: 'Searches "LeadSponsorName" field' },
        // "query.id": { type: "string", description: "Study IDs query" },
        "query.patient": { type: "string", description: "Search all patient details" },
        "filter.overallStatus": {
          type: "array",
          items: { type: "string" },
          description:
            "Can be ACTIVE_NOT_RECRUITING, COMPLETED, ENROLLING_BY_INVITATION, NOT_YET_RECRUITING, RECRUITING, SUSPENDED, TERMINATED, WITHDRAWN, AVAILABLE, NO_LONGER_AVAILABLE, TEMPORARILY_NOT_AVAILABLE, APPROVED_FOR_MARKETING, WITHHELD, UNKNOWN",
        },
        // "filter.geo": { type: "string", description: "Geo-function filter. Format: distance(lat, long, dist)" },
        // "filter.ids": {
        //   type: "array",
        //   items: { type: "string" },
        //   description: "List of NCT IDs",
        // },
        // "filter.advanced": { type: "string", description: "Essie expression filter. Examples: AREA[StartDate]2022" },
        // "filter.synonyms": {
        //   type: "array",
        //   items: { type: "string" },
        //   description: "Comma- or pipe-separated area:synonym_id pairs",
        // },
        // "postFilter.overallStatus": {
        //   type: "array",
        //   items: { type: "string" },
        //   description: "Status filter. Examples: NOT_YET_RECRUITING, RECRUITING",
        // },
        // "postFilter.geo": {
        //   type: "string",
        //   description: "Geo-function filter. Examples: distance(39.0035707,-77.1013313,50mi)",
        // },
        // "postFilter.ids": {
        //   type: "array",
        //   items: { type: "string" },
        //   description: "NCT ID filter. Examples: [ NCT04852770, NCT01728545 ]",
        // },
        // "postFilter.advanced": {
        //   type: "string",
        //   description: "Essie expression filter. Examples: AREA[StartDate]2022",
        // },
        // "postFilter.synonyms": {
        //   type: "array",
        //   items: { type: "string" },
        //   description: "Area:synonym_id pairs filter",
        // },
        // aggFilters: { type: "string", description: "Aggregation filter. Format: filter_id:option keys" },
        // geoDecay: {
        //   type: "string",
        //   description: "Proximity factor for geo-filtering. Examples: func:linear,scale:100km",
        // },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "protocolSection.identificationModule",
              "protocolSection.statusModule",
              "protocolSection.sponsorCollaboratorsModule",
              "protocolSection.oversightModule",
              "protocolSection.descriptionModule",
              "protocolSection.designModule",
              "protocolSection.eligibilityModule",
              "protocolSection.ipdSharingStatementModule",
            ],
          },
          description: "Pick ALL modules relevant to answering the question",
        },
        sort: {
          type: "array",
          items: { type: "string" },
          maxItems: 2,
          description: "Sorting options. Examples: @relevance, LastUpdatePostDate, EnrollmentCount:desc, NumArmGroups",
        },
        // countTotal: { type: "boolean", description: "Returns totalCount with the first page if true" },
        // page: {
        //   type: "integer",
        //   description: "Page number for pagination",
        //   default: 1,
        // },
        // pageSize: {
        //   type: "integer",
        //   description: "Results per page (max 1000)",
        //   default: 1000,
        // },
        // fields: {
        //   type: "array",
        //   items: { type: "string" },
        //   description: "Specific fields to return in the response",
        // },
      },
    },
  },
  study: {
    name: "study",
    description: "Get a single study by NCT ID",
    parameters: {
      type: "object",
      properties: {
        nctId: { type: "string", description: "NCT ID" },
      },
    },
  },
};
