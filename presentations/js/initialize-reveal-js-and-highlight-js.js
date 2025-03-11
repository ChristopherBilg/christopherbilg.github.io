import Reveal from "../lib/reveal.js-5.1.0/reveal.esm.js";

// Initialize the Reveal.js slide deck
let deck = new Reveal({
  slideNumber: "c/t",
  help: true,
});
deck.initialize();

// Highlight all highlight-able code locations on the webpage
hljs.highlightAll();
