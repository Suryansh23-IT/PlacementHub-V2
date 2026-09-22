# AI Features

## Boundaries

AI is optional. A failed AI request must show a clear temporary-unavailable message and must not affect login, profiles, jobs, eligibility, applications, recruitment, or reports.

## Resume feedback

Input: extracted resume text and requested analysis type.

Output: structured summary, detected skills, strengths, missing information, improvement suggestions, and an advisory score. The score is not an official placement decision.

## Job preparation

Input: job title, description, required skills, and selected non-sensitive student profile data.

Output: prioritized topics, suggested concepts/questions, and a short preparation plan.

## Safety and storage

The OpenAI API key remains on the backend. Requests minimize personal data. Validate AI output before storing it in `AIAnalysis`, rate-limit AI endpoints, and retain an error message/status when a request fails.
