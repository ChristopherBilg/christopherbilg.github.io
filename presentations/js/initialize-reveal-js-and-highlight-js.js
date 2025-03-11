import Reveal from "../lib/reveal.js-5.1.0/reveal.esm.js";

let deck = new Reveal({
  slideNumber: "c/t",
  help: true,
});
deck.initialize();

hljs.highlightAll();
