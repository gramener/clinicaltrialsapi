import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@1";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { network } from "https://cdn.jsdelivr.net/npm/@gramex/network@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { api, tools } from "./clinicaltrials.js";

const $queryForm = document.getElementById("query-form");
const $query = document.getElementById("query");
const $searchParams = document.getElementById("search-params");
const $error = document.getElementById("error");
const $network = document.getElementById("network");
const $summary = document.getElementById("summary");
const $searchDocuments = document.getElementById("search-documents");
const spinner = (text) => html`<div class="alert alert-info narrative mx-auto d-flex align-items-center">
  <div class="spinner-border text-primary ms-2" role="status">
    <span class="visually-hidden">Loading...</span>
  </div>
  <span class="ms-2">${text}</span>
</div>`;
const marked = new Marked();
let studies;

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
  render(spinner("Creating the Clinical Trials API query..."), $searchParams);
  render("", $summary);
  render("", $error);
  let result;
  for await (result of asyncLLM("https://llmfoundry.straive.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
  await runSearch(parse(result.args));
  await similarity();
  await summarize();
});

/**
 * Render the query as a key-value table
 * @param {Object} query
 */
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
              <td>${typeof v === "object" ? JSON.stringify(v) : v}</td>
            </tr>`
        )}
      </tbody>
    </table>`,
    $searchParams
  );
}

async function runSearch(args) {
  render(spinner("Searching the Clinical Trials API..."), $searchDocuments);
  studies = (await api.studies(args)).studies;
  console.log(studies);
  renderStudies();
}

function renderStudies({ nctIds, nodes } = {}) {
  const renderedStudies = nodes && nodes.length ? nodes : studies;
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

async function similarity() {
  $network.innerHTML = /* html */ `<div class="spinner-border text-primary ms-2" role="status"></div>`;

  const docs = studies.map((study) => {
    const briefTitle = study.protocolSection?.identificationModule?.briefTitle ?? "";
    const officialTitle = study.protocolSection?.identificationModule?.officialTitle ?? "";
    return `${briefTitle}\n${officialTitle}`;
  });

  let similarityResults;
  try {
    similarityResults = await fetch("https://llmfoundry.straive.com/similarity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
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

  const nodes = [...studies];
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
      brush: (nodes) => renderStudies({ nodes }),
      d3,
    });
    graph.nodes
      .attr("fill", (d) => statusColor[d.protocolSection?.statusModule?.overallStatus] ?? "#888")
      .attr("stroke", "white")
      .attr("r", 10)
      .attr("data-bs-toggle", "tooltip");
    graph.links.attr("stroke", "rgba(0,0,0,0.2)");
  }
  draw();
  $minSimilarity.addEventListener("input", draw);
}

async function summarize() {
  render(spinner("Finding the most relevant results to the question..."), $summary);
  let result;
  const query = $query.value;
  for await (result of asyncLLM("https://llmfoundry.straive.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: "Find studies that will have the most relevant answers to the user question" },
        { role: "user", content: query },
        // #TODO: Send only relevant information?
        { role: "assistant", content: JSON.stringify(studies.slice(0, 10), null, 2).slice(0, 500000) },
        {
          role: "user",
          content: `
Answer the user question ONLY using these studies, in one or two paragraphs.
Highlight key words in **bold** so that just reading the bold words gives you the answer.
Cite the relevant NCT IDs inline like this: [NCTnnnn](https://clinicaltrials.gov/study/NCTnnnn).

Then list 1-line summaries of the studies with the most relevant snippet supporting the answer, like this:

- [NCTnnnn](https://clinicaltrials.gov/study/NCTnnnn): [1-line summary of the study]

`.trim(),
        },
      ],
    }),
  })) {
    if (result.content) render(unsafeHTML(marked.parse(result.content)), $summary);
    if (result.error) render(html`<div class="alert alert-danger">${result.error}</div>`, $error);
  }
  // Make all links open in a new tab
  $summary.querySelectorAll("a").forEach((a) => a.setAttribute("target", "_blank"));
}
