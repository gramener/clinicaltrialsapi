# Clinical Trials API Agent

An interactive web application that helps users query and analyze data from the [ClinicalTrials.gov API](https://www.clinicaltrials.gov/data-api/api) using natural language questions.

## Features

- Natural language query interface for clinical trials data
- Automatic conversion of questions into structured API queries
- Real-time search results with detailed study information
- Smart summarization of relevant findings
- Dark/Light theme support
- Mobile-responsive design

## Usage

1. Enter a question in the search box or select from sample questions
2. The application will:
   - Convert your question into API parameters
   - Search relevant clinical trials
   - Display matching studies in a table
   - Provide a summarized answer with citations

### Example Questions

- "What are inclusion-exclusion criteria for a diabetes trial on 65+ patients?"
- "What are primary and secondary outcomes for breast cancer patients?"
- "Which interventions are being tested in 50+ Alzheimer's patients?"
- "What are the eligibility criteria for pediatric asthma trials?"
- "What is the average duration of depression medications trials?"

## Screenshot

![Screenshot](screenshot.png)

## Installation

### Prerequisites

- Modern web browser with JavaScript enabled
- Access to [LLM Foundry API](https://llmfoundry.straive.com/code) (for question processing)
- Internet connection for accessing [ClinicalTrials.gov API](https://www.clinicaltrials.gov/data-api/api)

### Local Setup

1. Clone this repository:

```bash
git clone https://github.com/gramener/clinicaltrialsapi.git
cd clinicaltrialsapi
```

2. Serve the files using any static web server. For example, using Python:

```bash
python -m http.server
```

3. Open `http://localhost:8000` in your web browser

### Deployment

On [Cloudflare DNS](https://dash.cloudflare.com/2c483e1dd66869c9554c6949a2d17d96/straive.app/dns/records),
proxy CNAME `clinicaltrialsapi.straive.app` to `gramener.github.io`.

On this repository's [page settings](https://github.com/gramener/clinicaltrialsapi/settings/pages), set

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/`

## Technical Details

### Architecture

- Frontend: Vanilla JavaScript with lit-html for rendering
- API Integration: [ClinicalTrials.gov API](https://www.clinicaltrials.gov/data-api/api) v2, specifically the `/studies` endpoint
- LLM Integration: [LLM Foundry API](https://llmfoundry.straive.com/code) for query processing, specifically the `/openai/v1/chat/completions` endpoint with `gpt-4o-mini` model
- Styling: Bootstrap 5.3.3 with dark mode support

### Dependencies

- [lit-html](https://www.npmjs.com/package/lit-html): Template rendering
- [asyncLLM](https://www.npmjs.com/package/asyncllm): Streaming LLM responses
- [marked](https://www.npmjs.com/package/marked): Markdown parsing
- [partial-json](https://www.npmjs.com/package/partial-json): JSON parsing
- [Bootstrap](https://getbootstrap.com/): UI framework
- [Bootstrap Icons](https://icons.getbootstrap.com/): Icon set

## Development

### Project Structure

```
├── index.html # Main HTML file
├── script.js # Main application logic
├── clinicaltrials.js # API integration module
└── README.md # Documentation
```

### Key Components

- Query Processing: Converts natural language to structured API queries
- Study Rendering: Displays study data in a responsive table
- Summary Generation: Creates natural language summaries of findings
- Theme Management: Handles dark/light mode preferences

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

[MIT](LICENSE)
