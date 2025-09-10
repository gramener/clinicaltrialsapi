const CLINICAL_TRIALS_BASE = "https://clinicaltrials.gov/api/v2";
const OPENFDA_BASE = "https://api.fda.gov";

async function runAPI(baseUrl, path, params = {}) {
  const url = `${baseUrl}${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API Error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function runClinicalTrials(path, params = {}) {
  return runAPI(CLINICAL_TRIALS_BASE, path, params);
}
async function runOpenFDA(path, params = {}) {return runAPI(OPENFDA_BASE, path, params); }

function addFields(params = {}) {
  const newParams = { ...params };
  if (!newParams.fields) newParams.fields = [];
  for (const module of ["identificationModule", "statusModule"]) {
    const field = `protocolSection.${module}`;
    if (!newParams.fields.includes(field)) newParams.fields.push(field);
  }
  return newParams;
}

export const api = {
  studies: (params = {}) => runClinicalTrials("/studies", { pageSize: 50, ...addFields(params) }),
  study: ({ nctId }) => runClinicalTrials(`/studies/${nctId}`),
  studiesMetadata: () => runClinicalTrials("/studies/metadata"),
  studiesSearchAreas: () => runClinicalTrials("/studies/search-areas"),
  studiesEnums: () => runClinicalTrials("/studies/enums"),
  statsSize: (params) => runClinicalTrials("/stats/size", params),
  statsFieldValues: (params) => runClinicalTrials("/stats/field/values", params),
  statsFieldSizes: (params) => runClinicalTrials("/stats/field/sizes", params),
  drugLabeling: (params) => runOpenFDA("/drug/label.json", { limit: 10, ...params }),
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
          description: "Search age, phase, design, sponsor, keyword, etc.",
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
              "protocolSection.outcomesModule",
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
  
  // OpenFDA Tools
  drugLabeling: {
    name: "drugLabeling",
    description: "Search FDA drug labeling data. For multiple drugs, combine ALL searches in a single 'searches' array. NEVER create multiple separate JSON objects.",
    parameters: {
      type: "object",
      properties: {
        searches: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Array of search queries for multiple drugs. Examples: ['openfda.brand_name:Stelara', 'openfda.brand_name:Tremfya']. Use this for multiple drugs in ONE array."
        },
        search: {
          type: "string",
          description: "Single search query for one drug only. Examples: 'openfda.brand_name:lipitor', 'boxed_warning:_exists_'. Use searches array for multiple drugs."
        },
        limit: {
          type: "integer",
          description: "Number of records to return per search (max 1000)",
          default: 10
        }
      }
    }
  }
};