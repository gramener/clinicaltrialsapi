import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@1";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { api, tools } from "./clinicaltrials.js";

const $queryForm = document.getElementById("query-form");
const $searchParams = document.getElementById("search-params");
const $error = document.getElementById("error");
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

$queryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = document.getElementById("query").value;
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
  renderStudies();
}

function renderStudies(nctIds = []) {
  const study = studies[0];
  if (!study) return render(html`<div class="alert alert-warning">No studies found</div>`, $searchDocuments);
  render(
    html`<table class="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          ${study.protocolSection?.conditionsModule ? html`<th>Conditions</th>` : null}
          ${study.protocolSection?.armsInterventionsModule ? html`<th>Interventions</th>` : null}
          ${study.protocolSection?.eligibilityModule ? html`<th>Eligibility</th>` : null}
        </tr>
      </thead>
      <tbody>
        ${studies.map((study) => {
          const nctId = study.protocolSection?.identificationModule?.nctId;
          const title = study.protocolSection?.identificationModule?.briefTitle;
          const interventions = truncate(
            study.protocolSection?.armsInterventionsModule?.armGroups
              ?.map(({ label, description }) => `[${label}]: ${description}`)
              .join("\n")
          );
          const eligibility = truncate(study.protocolSection?.eligibilityModule?.eligibilityCriteria);
          return html`<tr class="${nctIds.includes(nctId) ? "table-warning" : ""}">
            <td data-col="Title">
              <div class="text-muted fw-bold small">${nctId}</div>
              <div class="fw-bold">
                <a href="https://clinicaltrials.gov/study/${nctId}" target="_blank">${title}</a>
              </div>
              <span class="badge rounded-pill text-bg-warning">${study.protocolSection?.designModule?.studyType}</span>
            </td>
            <td data-col="Status">
              <strong>${study.protocolSection?.statusModule?.overallStatus}</strong>:
              ${study.protocolSection?.statusModule?.startDateStruct?.date} -
              ${study.protocolSection?.statusModule?.primaryCompletionDateStruct?.date}
            </td>
            ${study.protocolSection?.conditionsModule
              ? html`<td data-col="Conditions">
                  ${truncate(study.protocolSection?.conditionsModule?.conditions?.join(", "))}
                </td>`
              : null}
            ${study.protocolSection?.armsInterventionsModule
              ? html`<td data-col="Interventions">${interventions}</td>`
              : null}
            ${study.protocolSection?.eligibilityModule ? html`<td data-col="Eligibility">${eligibility}</td>` : null}
          </tr>`;
        })}
      </tbody>
    </table>`,
    $searchDocuments
  );
}

function truncate(text, length = 100) {
  return text && text.length > length ? text.slice(0, length) + "..." : text;
}

async function summarize() {
  render(spinner("Finding the most relevant results to the question..."), $summary);
  let result;
  const query = document.getElementById("query").value;
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
        { role: "assistant", content: JSON.stringify(studies, null, 2).slice(0, 500000) },
        {
          role: "user",
          content: `
Write the step by step process to answer the user question with the data, like this:

<details class="alert alert-info mb-3" open>
  <summary>Approach...</summary>
  <p>[Your step by step process to answer the question in a single paragraph]</p>
</details>

Then answer the question in Markdown. Don't list the studies. Write the answer in a paragraph or two.
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
