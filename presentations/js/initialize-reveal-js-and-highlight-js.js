import Notes from "../lib/reveal.js-5.1.0/plugin/notes/notes.esm.js";
import Search from "../lib/reveal.js-5.1.0/plugin/search/search.esm.js";
import Zoom from "../lib/reveal.js-5.1.0/plugin/zoom/zoom.esm.js";
import Reveal from "../lib/reveal.js-5.1.0/reveal.esm.js";

// Initialize the Reveal.js slide deck
let deck = new Reveal({
  help: true,
  plugins: [Notes, Search, Zoom],
  slideNumber: "c/t",
});
deck.initialize();

// Highlight all highlight-able code locations on the webpage
hljs.highlightAll();
