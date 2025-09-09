import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@1";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { network } from "https://cdn.jsdelivr.net/npm/@gramex/network@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { api, tools } from "./clinicaltrials.js";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";

const $queryForm = document.getElementById("query-form");
const $query = document.getElementById("query");
const $searchParams = document.getElementById("search-params");
const $error = document.getElementById("error");
const $network = document.getElementById("network");
const $summary = document.getElementById("summary");
const $searchDocuments = document.getElementById("search-documents");
const $apiSubtitle = document.getElementById("api-subtitle");
const $clinicalTrialsDescription = document.getElementById("clinical-trials-description");
const $openfdaDescription = document.getElementById("openfda-description");

const spinner = (text) => html`<div class="alert alert-info narrative mx-auto d-flex align-items-center">
  <div class="spinner-border text-primary ms-2" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>
  <span class="ms-2">${text}</span>
</div>`;
const marked = new Marked();
let currentData;
let currentApiType = 'clinicaltrials';
let llmConfig = null;

const statusColor = {
  ACTIVE_NOT_RECRUITING: "#17a2b8",
  COMPLETED: "#007bff",
  ENROLLING_BY_INVITATION: "#6f42c1",
  NOT_YET_RECRUITING: "#ffc107",
  RECRUITING: "#28a745",
  SUSPENDED: "#fd7e14",
  TERMINATED: "#dc3545",
  WITHDRAWN: "#b22222",
  AVAILABLE: "#20c997",
  NO_LONGER_AVAILABLE: "#adb5bd",
  TEMPORARILY_NOT_AVAILABLE: "#ff7f50",
  APPROVED_FOR_MARKETING: "#663399",
  WITHHELD: "#e83e8c",
  UNKNOWN: "#6c757d",
};

async function initializeLLMProvider() {
  try {
    llmConfig = await openaiConfig({
      defaultBaseUrls: [ "https://llmfoundry.straive.com/openai/v1", "https://api.openai.com/v1"],
      title: "Configure LLM Provider",
      show: true
    });
  } catch (error) {
    render(html`<div class="alert alert-danger"> Failed to configure LLM provider.</div>`, $error);
  }
}

function updateAPISelector() {
  document.querySelectorAll('.api-card').forEach(card => { card.classList.remove('selected'); });
  const selectedCard = document.querySelector(`.api-card[data-api="${currentApiType}"]`);
  selectedCard.classList.add('selected');
  if (currentApiType === 'clinicaltrials') {
    $apiSubtitle.innerHTML = 'Answer questions from the <a href="https://www.clinicaltrials.gov/data-api/api" id="api-link">ClinicalTrials.gov API</a>';
    $clinicalTrialsDescription.style.display = 'block';
    $openfdaDescription.style.display = 'none';
    document.querySelectorAll('.clinical-trials-demo').forEach(el => el.style.display = 'block');
    document.querySelectorAll('.openfda-demo').forEach(el => el.style.display = 'none');
    
  } else {
    $apiSubtitle.innerHTML = 'Answer questions from the <a href="https://open.fda.gov/apis/" id="api-link">OpenFDA API</a>';
    $clinicalTrialsDescription.style.display = 'none';
    $openfdaDescription.style.display = 'block';
    document.querySelectorAll('.clinical-trials-demo').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.openfda-demo').forEach(el => el.style.display = 'block');
  }
}

document.querySelectorAll('.api-card').forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    currentApiType = card.dataset.api;
    updateAPISelector();
  });
});

document.querySelector("#demos").addEventListener("click", (e) => {
  const $demo = e.target.closest(".demo");
  if ($demo) {
    e.preventDefault();
    $query.value = $demo.textContent;
    $queryForm.dispatchEvent(new Event("submit"));
  }
});

$queryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = $query.value;
  currentApiType === 'clinicaltrials' ? await handleClinicalTrialsQuery(query) : await handleOpenFDAQuery(query);
});

async function handleClinicalTrialsQuery(query) {
  render(spinner("Creating the Clinical Trials API query..."), $searchParams);
  render("", $summary);
  render("", $error);
  let result;
  for await (result of asyncLLM(llmConfig.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json",  "Authorization": `Bearer ${llmConfig.apiKey}`},
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: `
Find studies that will have the most relevant answers to the user question.
In query.*, don't use phrases as-is. Always identify the most relevant keywords, combining them with AND.
E.g. "violation by the FDA" becomes "violation AND FDA".
E.g. "improper adherence to safety and scientific integrity" becomes "adherence AND safety AND integrity"
`.trim(),
        },
        { role: "user", content: query },
      ],
      tools: [{ type: "function", function: tools.studies }],
      tool_choice: { type: "function", function: { name: "studies" } },
    }),
  })) {
    if (result.args) drawSearchParams(parse(result.args));
    if (result.error) render(html`<div class="alert alert-danger">${result.error}</div>`, $error);
  }
  await runClinicalTrialsSearch(parse(result.args));
  await similarity();
  await summarize();
}

async function handleOpenFDAQuery(query) {
  render(spinner("Creating the OpenFDA API query..."), $searchParams);
  render("", $summary);
  render("", $error);
  let result;
  for await (result of asyncLLM(llmConfig.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: `
Find FDA drug data that will have the most relevant answers to the user question.
For search queries, use proper OpenFDA syntax:
- For multiple drugs, use "searches" array: ["openfda.brand_name:drug1", "openfda.brand_name:drug2"]
- For single drug, use "search" string: "openfda.brand_name:drugname"
- For exact phrase matching, use field:value
- limit must be 10
- For existence checks, use field:_exists_
- For date ranges, use field:[YYYYMMDD+TO+YYYYMMDD]
- Don't use phrases as-is. Always identify the most relevant keywords.
`.trim(),
        },
        { role: "user", content: query },
      ],
      tools: [{ type: "function", function: tools.drugLabeling }],
      tool_choice: { type: "function", function: { name: "drugLabeling" } },
    }),
  })) {
    if (result.args) drawSearchParams(parse(result.args));
    if (result.error) render(html`<div class="alert alert-danger">${result.error}</div>`, $error);
  }
  
  await runOpenFDASearch(result.name, parse(result.args));
  await similarity();
  await summarize();
}

function drawSearchParams(query) {
  render(
    html`<table class="table">
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(query).map(
          ([k, v]) =>
            html`<tr>
              <td>${k}</td>
              <td>${Array.isArray(v) ? 
                html`<ul class="mb-0">${v.map(item => html`<li>${item}</li>`)}</ul>` :
                (typeof v === "object" ? JSON.stringify(v) : v)
              }</td>
            </tr>`
        )}
      </tbody>
    </table>`,
    $searchParams
  );
}

async function runClinicalTrialsSearch(args) {
  render(spinner("Searching the Clinical Trials API..."), $searchDocuments);
  currentData = (await api.studies(args)).studies;
  console.log(currentData);
  renderClinicalTrialsStudies();
}

async function runOpenFDASearch(endpoint, args) {
  render(spinner("Searching the OpenFDA API..."), $searchDocuments);
  try {
    let allResults = [];
    let searchQueries = [];
    if (args.searches && Array.isArray(args.searches)) {
      searchQueries = args.searches;
    } else if (args.search) {
      searchQueries = [args.search];
    } else {
      throw new Error("No search query provided");
    }
    for (const searchQuery of searchQueries) {
      const searchArgs = { 
        search: searchQuery, 
        limit: args.limit || 10
      };
      const result = await api.drugLabeling(searchArgs);
      if (result.results && result.results.length > 0) {
        const resultsWithSource = result.results.map(item => ({
          ...item,
          _searchQuery: searchQuery
        }));
        allResults = allResults.concat(resultsWithSource);
      }
    }
    currentData = allResults;
    console.log(`Total results from ${searchQueries.length} searches:`, currentData.length);
    renderOpenFDAResults(endpoint);
  } catch (error) {
    console.error("OpenFDA Search Error:", error);
    render(html`<div class="alert alert-danger">Error: ${error.message}</div>`, $searchDocuments);
    currentData = [];
  }
}

function renderClinicalTrialsStudies({ nctIds, nodes } = {}) {
  const renderedStudies = nodes && nodes.length ? nodes : currentData;
  const study = renderedStudies[0];
  if (!study) return render(html`<div class="alert alert-warning">No studies found</div>`, $searchDocuments);
  nctIds = nctIds ?? [];
  
  render(
    html`<div class="list-group">
      ${renderedStudies.slice(0, 10).map((study) => {
        const nctId = study.protocolSection?.identificationModule?.nctId;
        const title = study.protocolSection?.identificationModule?.briefTitle;
        const interventions = study.protocolSection?.armsInterventionsModule?.armGroups
          ?.map(({ label, description }) => `[${label}]: ${description}`)
          .join("\n");
        const eligibility = study.protocolSection?.eligibilityModule?.eligibilityCriteria;

        return html`<div class="list-group-item ${nctIds.includes(nctId) ? "list-group-item-warning" : ""}">
          <div class="mb-2">
            <div class="text-muted fw-bold small">${nctId}</div>
            <div class="fw-bold">
              <a href="https://clinicaltrials.gov/study/${nctId}" target="_blank">${title}</a>
            </div>
            <span class="badge rounded-pill text-bg-warning">${study.protocolSection?.designModule?.studyType}</span>
          </div>

          <div class="mb-2">
            <i
              class="bi bi-circle-fill"
              style="color: ${statusColor[study.protocolSection?.statusModule?.overallStatus]}"
            ></i>
            ${study.protocolSection?.statusModule?.overallStatus}
            (${study.protocolSection?.statusModule?.startDateStruct?.date} -
            ${study.protocolSection?.statusModule?.primaryCompletionDateStruct?.date})
          </div>

          ${study.protocolSection?.conditionsModule
            ? html`<details class="mb-2">
                <summary>Conditions</summary>
                ${study.protocolSection?.conditionsModule?.conditions?.join(", ")}
              </details>`
            : null}
          ${study.protocolSection?.armsInterventionsModule
            ? html`<details class="mb-2">
                <summary>Interventions</summary>
                ${interventions}
              </details>`
            : null}
          ${study.protocolSection?.eligibilityModule
            ? html`<details class="mb-2">
                <summary>Eligibility</summary>
                ${unsafeHTML(marked.parse(eligibility))}
              </details>`
            : null}
          ${study.protocolSection?.outcomesModule
            ? html`<details class="mb-2">
                <summary>Outcomes</summary>
                <ol>
                  ${["primaryOutcomes", "secondaryOutcomes", "otherOutcomes"].map((key) => {
                    const outcomes = study.protocolSection?.outcomesModule[key];
                    if (!outcomes) return null;
                    return outcomes.map(({ measure, description, timeFrame }) => {
                      return html`<li><strong>${measure}</strong> ${description} <em>${timeFrame}</em></div>`;
                    });
                  })}
                </ol>
              </details>`
            : null}
        </div>`;
      })}
    </div>`,
    $searchDocuments
  );
}

function renderOpenFDAResults(endpoint, { nodes } = {}) {
  const renderedResults = nodes && nodes.length ? nodes : currentData;
  if (!renderedResults || renderedResults.length === 0) {
    return render(html`<div class="alert alert-warning">No results found</div>`, $searchDocuments);
  }
  render(
    html`<div class="list-group">
      ${renderedResults.slice(0, 10).map((result) => {
        return renderDrugLabelingResult(result);
      })}
    </div>`,
    $searchDocuments
  );
}

function renderDrugLabelingResult(result) {
  const brandName = result.openfda?.brand_name?.[0] || 'N/A';
  const genericName = result.openfda?.generic_name?.[0] || 'N/A';
  const manufacturerName = result.openfda?.manufacturer_name?.[0] || 'N/A';
  const productType = result.openfda?.product_type?.[0] || 'N/A';
  const ndcCodes = result.openfda?.product_ndc || [];
  const nuiCodes = result.openfda?.nui || [];
  
  return html`<div class="list-group-item">
    <div class="mb-2">
      <div class="fw-bold">${brandName} (${genericName})</div>
      <span class="badge rounded-pill text-bg-primary">${productType}</span>
      <div class="text-muted small">Manufacturer: ${manufacturerName}</div>
      <div class="text-muted small">Search Query: ${result._searchQuery || 'N/A'}</div>
    </div>
    
    ${ndcCodes.length > 0 ? html`<details class="mb-2">
      <summary>NDC Codes (${ndcCodes.length})</summary>
      <ul class="mb-0">
        ${ndcCodes.map(ndc => html`<li>${ndc}</li>`)}
      </ul>
    </details>` : null}
    
    ${nuiCodes.length > 0 ? html`<details class="mb-2">
      <summary>NUI Codes (${nuiCodes.length})</summary>
      <ul class="mb-0">
        ${nuiCodes.map(nui => html`<li>${nui}</li>`)}
      </ul>
    </details>` : null}
    
    ${result.boxed_warning ? html`<details class="mb-2">
      <summary class="text-danger fw-bold">⚠️ Boxed Warning</summary>
      <div class="text-danger">${result.boxed_warning?.[0]}</div>
    </details>` : null}
    
    ${result.indications_and_usage ? html`<details class="mb-2">
      <summary>Indications and Usage</summary>
      ${result.indications_and_usage?.[0]}
    </details>` : null}
    
    ${result.contraindications ? html`<details class="mb-2">
      <summary>Contraindications</summary>
      ${result.contraindications?.[0]}
    </details>` : null}
    
    ${result.adverse_reactions ? html`<details class="mb-2">
      <summary>Adverse Reactions</summary>
      ${result.adverse_reactions?.[0]}
    </details>` : null}
  </div>`;
}

async function similarity() {
  $network.innerHTML = /* html */ `<div class="spinner-border text-primary ms-2" role="status"></div>`;
  
  let docs;
  if (currentApiType === 'clinicaltrials') {
    docs = currentData.map((study) => {
      const briefTitle = study.protocolSection?.identificationModule?.briefTitle ?? "";
      const officialTitle = study.protocolSection?.identificationModule?.officialTitle ?? "";
      return `${briefTitle}\n${officialTitle}`;
    });
  } else {
    docs = currentData.map((result) => {
      const brandName = result.openfda?.brand_name?.[0] || '';
      const genericName = result.openfda?.generic_name?.[0] || '';
      const indications = result.indications_and_usage?.[0] || '';
      return `${brandName} ${genericName}\n${indications}`;
    });
  }
  
  let similarityResults;
  try {
    similarityResults = await fetch(llmConfig.baseUrl.split('.com')[0] + '.com/similarity', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify({ model: "text-embedding-3-small", docs }),
    }).then((r) => r.json());
  } catch (e) {
    console.error(e);
    $network.innerHTML = /* html */ `<div class="alert alert-danger">${e.message}</div>`;
    return;
  }
  $network.innerHTML = /* html */ `
    <input class="form-range" type="range" min="0" max="1" step="0.01" value="0.7" id="min-similarity" />
    <svg id="network-graph" width="600" height="600" class="img-fluid"></svg>
  `;
  const $minSimilarity = $network.querySelector("#min-similarity");
  const nodes = [...currentData];
  
  function draw() {
    const links = [];
    const minSimilarity = +$minSimilarity.value;
    similarityResults.similarity.forEach((row, i) => {
      row.forEach((val, j) => {
        if (val >= minSimilarity) links.push({ source: nodes[i], target: nodes[j] });
      });
    });
    const graph = network($network.querySelector("#network-graph"), {
      nodes,
      links,
      forces: { charge: () => d3.forceManyBody().strength(-200) },
      brush: (nodes) => {
        currentApiType === 'clinicaltrials' ? renderClinicalTrialsStudies({ nodes })
              : renderOpenFDAResults('drugLabeling', { nodes });
      },
      d3,
    });
    
    graph.nodes
      .attr("fill", (d) => {
        if (currentApiType === 'clinicaltrials') {
          return statusColor[d.protocolSection?.statusModule?.overallStatus] ?? "#888";
        } else {
          const productType = d.openfda?.product_type?.[0];
          const colorKeys = Object.keys(statusColor);
          if (productType?.includes('PRESCRIPTION')) return statusColor.COMPLETED;
          if (productType?.includes('OTC')) return statusColor.RECRUITING;
          if (productType?.includes('HUMAN')) return statusColor.ACTIVE_NOT_RECRUITING;
          if (productType?.includes('DEVICE')) return statusColor.NOT_YET_RECRUITING;
          const manufacturer = d.openfda?.manufacturer_name?.[0];
          if (manufacturer) {
            const hashCode = manufacturer.split('').reduce((a, b) => {
              a = ((a << 5) - a) + b.charCodeAt(0);
              return a & a;
            }, 0);
            const colorIndex = Math.abs(hashCode) % colorKeys.length;
            return statusColor[colorKeys[colorIndex]];
          }
          
          return "#007bff";
        }
      })
      .attr("stroke", "white")
      .attr("r", 10)
      .attr("data-bs-toggle", "tooltip")
      .attr("title", (d) => {
        if (currentApiType === 'clinicaltrials') {
          const nctId = d.protocolSection?.identificationModule?.nctId || 'N/A';
          const title = d.protocolSection?.identificationModule?.briefTitle || 'No title';
          const status = d.protocolSection?.statusModule?.overallStatus || 'Unknown';
          return `${nctId}: ${title}\nStatus: ${status}`;
        } else {
          const brandName = d.openfda?.brand_name?.[0] || 'N/A';
          const genericName = d.openfda?.generic_name?.[0] || 'N/A';
          const manufacturer = d.openfda?.manufacturer_name?.[0] || 'N/A';
          const productType = d.openfda?.product_type?.[0] || 'N/A';
          return `${brandName} (${genericName})\nManufacturer: ${manufacturer}\nType: ${productType}`;
        }
      });
    
    graph.links.attr("stroke", "rgba(0,0,0,0.2)");
  }
  draw();
  $minSimilarity.addEventListener("input", draw);
}

async function summarize() {
  const spinnerText = currentApiType === 'clinicaltrials' 
    ? "Finding the most relevant results to the question..." 
    : "Finding the most relevant FDA data to answer the question...";
  
  render(spinner(spinnerText), $summary);
  let result;
  const query = $query.value;
  const systemPrompt = currentApiType === 'clinicaltrials'
    ? "Find studies that will have the most relevant answers to the user question"
    : "Find FDA drug data that will have the most relevant answers to the user question";
  
  const userPrompt = currentApiType === 'clinicaltrials'
    ? `
Answer the user question ONLY using these studies, in one or two paragraphs.
Highlight key words in **bold** so that just reading the bold words gives you the answer.
Cite the relevant NCT IDs inline like this: [NCTnnnn](https://clinicaltrials.gov/study/NCTnnnn).

Then list 1-line summaries of the studies with the most relevant snippet supporting the answer, like this:

- [NCTnnnn](https://clinicaltrials.gov/study/NCTnnnn): [1-line summary of the study]
`.trim()
    : `
Answer the user question ONLY using this FDA data, in one or two paragraphs.
Highlight key words in **bold** so that just reading the bold words gives you the answer.
Reference specific drug names and FDA findings inline.
Then list 1-line summaries of the most relevant FDA records supporting the answer, like this:
- **Drug Name**: [1-line summary of the FDA finding]
`.trim();

  const maxTokens = currentApiType === 'clinicaltrials' ? 500000 : 300000;
  
  for await (result of asyncLLM(llmConfig.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
        { role: "assistant", content: JSON.stringify(currentData.slice(0, 10), null, 2).slice(0, maxTokens) },
        { role: "user", content: userPrompt },
      ],
    }),
  })) {
    if (result.content) render(unsafeHTML(marked.parse(result.content)), $summary);
    if (result.error) render(html`<div class="alert alert-danger">${result.error}</div>`, $error);
  }
  
  $summary.querySelectorAll("a").forEach((a) => a.setAttribute("target", "_blank"));
}

updateAPISelector();
initializeLLMProvider();