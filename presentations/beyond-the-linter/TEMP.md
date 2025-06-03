# Beyond the Linter: Code Quality Strategies That Stick

## 1. Introduction & Premise (3–5 min)

Title Slide + Hook: “Your linter doesn't care about your product… but you should.”
Define what “code quality” really means—clarity, maintainability, correctness, velocity.
Make the case: Why linters and formatters are just the beginning.
Set expectations: This talk focuses on strategies that persist even as teams grow and change.

## 2. Level-Setting: What Linters Do (and Don’t Do) (4–5 min)

Quick demo or example: Lint catches == vs ===… but not architectural rot.
Limits of automation:
Doesn’t understand business logic
Doesn’t enforce patterns across repos
Doesn’t promote shared understanding
Introduce the idea of social vs technical enforcers.

## 3. The Pillars of Enduring Code Quality (20–22 min)

Structure this section around 3–4 big pillars or strategies.
a. Organizational Convention over Individual Preference (5–6 min)
Use shared style guides, commit conventions (e.g., Conventional Commits), mono-repo or poly-repo standardization.
Tools: ESLint config packages, Prettier, custom codemods.
Code example: How a team-shared ESLint rule can enforce design patterns.
b. Architectural & Domain Modeling Discipline (5–6 min)
High-level concepts like:
Feature-based folder structures
Domain-Driven Design (DDD) for frontend
Boundaries between UI logic and business logic
Code example: Clear separation of concerns in a Next.js app.
Strategies: ADRs (Architectural Decision Records), architecture docs with examples.
c. Code Review as a Culture Lever (5–6 min)
Senior engineers guiding through code review—not just for correctness but for clarity and design.
Pairing asynchronous reviews with live walkthroughs.
Tips: “Why not?” vs “Why?” comments, leading with questions.
d. Tests as Design Tools, not Just Safety Nets (4–5 min)
Quality tests communicate expected behavior, not just catch bugs.
Emphasize testing intent:
Unit tests for logic correctness
Integration tests for contract enforcement
E2E tests for confidence in critical paths
Code example: Testing a reusable component for behavior, not structure.

## 4. Making Quality Stick (5–6 min)

Institutionalize quality: Make good patterns easy, bad ones hard.
Examples:
CI checks that validate architectural boundaries
DX improvements: Generators, templates, scaffolds
Engineering playbooks, internal docs, and recorded walkthroughs
Team alignment: Run regular retros on code health, rotate “quality champions.”

## 5. Real-World War Stories & Lessons Learned (Optional: 3–5 min buffer)

Share a few quick, real examples:
A linter rule that caused more harm than good
A code review that changed team direction
A testing investment that saved a launch

## 6. Takeaways & Q&A (3–5 min)

Recap: Linters are helpful but not sufficient.
Sustainable code quality is social, architectural, and intentional.
Leave them with this quote: “Code is communication with humans first, computers second.”
Open floor for questions or discussion.

## 7. ✅ Bonus Materials (Optional handout or repo)

GitHub repo with:
Code samples from slides
Example ESLint config, Prettier setup
Folder structure templates
A testing strategy checklist
