# Vision and Purpose: simplyigit.github.io

## Project Overview
`simplyigit.github.io` is the personal portfolio of Yiğit (yiğit), a Machine Learning and Software developer. The website serves not only as a showcase for technical projects but as a dynamic digital expression of his identity, interests, and creative approach to UI/UX.

## Core Vision
The vision of the portfolio is to create an **immersive and interactive digital experience** that bridges the gap between a traditional professional resume and a personal dashboard. It emphasizes:

1.  **Aesthetic Sophistication:** Moving beyond flat design, the site uses hardware-accelerated ambient meshes, glassmorphism, 3D parallax effects, and cinematic gradients to create a "premium" and "alive" feel.
2.  **Dynamic Integration:** The site is "alive" with real-time data. It doesn't just list hobbies; it pulls live data from:
    *   **Spotify:** Top tracks and artists, visualized via a custom-built interactive cassette tape.
    *   **Letterboxd:** Recent movie watches and all-time favorites.
    *   **Goodreads:** Currently reading list and backlog.
3.  **Personality-First Engineering:** The "Fun Stuff" section is given significant weight, reflecting a belief that a developer's personality and tastes are integral to their work.

## Technical Architecture
*   **Frontend:** Built with Vanilla HTML/CSS/JS to maintain performance and total control over complex animations and 3D effects.
*   **Backend:** Utilizes Vercel Serverless Functions (Python) to bridge third-party APIs (Spotify, Letterboxd, Goodreads).
*   **State Management:** Innovative use of GitHub Gists as a "stateless database" for serverless token rotation (specifically for Spotify OAuth).
*   **Performance:** Implements aggressive caching (s-maxage, stale-while-revalidate) to ensure a fast user experience despite fetching data from multiple external sources.

## Evolution History
*   **Initial Redesign:** Established the base Vercel API architecture and moved away from static content.
*   **UI Overhaul (feat(ui)):** Refined the visual architecture into "immersive interactive posters" and cleaned up navigation.
*   **The Cassette Era:** Introduced the "Fun Stuff" redesign, focusing on a highly detailed, animated cassette tape for Spotify data, showcasing a focus on "micro-interactions" and "skeuomorphic" modernism.

## Purpose
The purpose of this website is to:
*   **Demonstrate Technical Competence:** Showcasing ML projects like the "Real, Deepfake or AI" detector.
*   **Express Creative Vision:** Using code to create unique, non-standard web components (like the dynamic cassette spools).
*   **Centralize Digital Presence:** Providing a single hub for GitHub, LinkedIn, Instagram, and various hobby-tracking platforms.
