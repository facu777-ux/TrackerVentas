---
description: "Improve chatbot navigation in TrackerVentas: fix action formats, add view routing, highlight records, and add quick-action buttons."

name: "Improve Chatbot Navigation"
argument-hint: "Navigation aspect to improve (e.g., 'view analytics from the chat', 'load highlighting', 'quick-access buttons')"
agent: "agent"
tools: [search, read_file, replace_string_in_file, multi_replace_string_in_file]
---

# Objective

Improve the navigation of the DIBIAGI AI chatbot in the TrackerVentas application. The chatbot should be able to navigate between views, locate specific records, and provide users with seamless quick access.

## Project Context

- **Frontend**: React + Vite in [frontend/src/](../frontend/src/)
- **Main chatbot component**: [frontend/src/components/ChatbotAssistant.jsx](../frontend/src/components/ChatbotAssistant.jsx)
- **Bot action coordinator in the app**: `handleBotAction` function in [frontend/src/App.jsx](../frontend/src/App.jsx)
- **AI processing (backend)**: [backend/services/aiService.js](../backend/services/aiService.js)
- **Chatbot controller**: [backend/controllers/chatbotController.js](../backend/controllers/chatbotController.js)

## Available Views in the App (`activeView` in App.jsx)

| Value | View |

-------|-------|

`'dashboard'` | Main tracking table (PRs, Loads, Invoices) |

`'analytics'` | Analytics Dashboard |

`'logistics'` | Logistics View |

## Current Navigation Issues to Resolve

### 1. Inconsistent Action Formatting Between Server and Client

- The server (`aiService.js → parsearRespuestaIA`) parses `ACTION:NAVIGATE|VIEW:page` and extracts `section`, but the `section` field is not used in `handleBotAction` of `App.jsx`.

- The client (`ChatbotAssistant.jsx`) parses `ACTION:NAVIGATE|TYPE|ID` (for individual records), but doesn't handle navigation to views.

- The system prompt in `generarContextoSistema` defines both formats contradictorily.

**Expected Solution**: Unify into a single clean format. For example:

- View navigation: `ACTION:NAVIGATE|VIEW:dashboard` / `VIEW:analitica` / `VIEW:logistica`

- Navigate + highlight record: `ACTION:NAVIGATE|PR:3315` / `ACTION:NAVIGATE|CARGA:4915`

### 2. View navigation doesn't reach the frontend

The `seccion` field is computed on the server but isn't returned to the client in a useful way, nor does `handleBotAction` handle it.


**Expected Solution**: The client should receive and process `NAVIGATE_VIEW` actions to change `activeView`.

### 3. Absence of Quick Action Buttons

The chat does not offer initial suggestions to facilitate access to the most common navigation functions.

**Expected Solution**: Display quick action buttons/chips when the chat is first opened (or when there are no user messages yet). Examples:
- "View Dashboard"
- "View Analytics"
- "View Logistics"
- "Search PR..." (the user should tap on this suggestion and then be able to enter the PR number)
- "Search Load..." (the user should tap on this suggestion and then be able to enter the Load number)

### 4. Lack of Visual Navigation Feedback

When the bot navigates to a section, the user does not receive visual confirmation that the view has changed.

**Expected Solution**: When performing a navigation action, display a system message in the chat (in italics or a different font) confirming the change: *"Navigating to Analytics..."*

## Agent Instructions

1. **Read the key files first** before editing:

- `frontend/src/components/ChatbotAssistant.jsx`

- `frontend/src/App.jsx` (especially `handleBotAction`)

- `backend/services/aiService.js` (especially `generarContextoSistema` and `parsearRespuestaAI`)

2. **Unify the command format** in `generarContextoSistema`:

- Eliminate the contradiction between the two current formats.

- Clearly document in the system prompt which formats the app accepts.

3. **Update `parsearRespuestaAI`** so that it correctly serializes both navigation to view and navigation to record.

4. **Update `handleBotAction` in `App.jsx` to handle the `NAVIGATE_VIEW` type and correctly change `activeView`.

5. **Update `ChatbotAssistant.jsx` to:

- Parse all agreed-upon action formats.

- Display a system message when navigation is executed.

- Add quick access buttons when the chat opens (if `messages` only contains the initial greeting).

6. **Do not change** the search, filter, or export business logic. Only navigation.

7. **Mentally test** the flows with real-world examples:

- User types "Show me PR 3315" → bot displays a card and navigates to the dashboard highlighting that record.

- User types "I want to see the analytics" → bot responds and executes `ACTION:NAVIGATE|VIEW:analytics`.

** - User clicks on "View Logistics" button → query is sent → bot navigates to