"use strict";

const { createStructuredIllustrationCardsFactory } = require("./native-rebuild-structured-illustration-cards");
const { createStructuredIllustrationResidualsFactory } = require("./native-rebuild-structured-illustration-residuals");

function createStructuredIllustrationFactory(dependencies = {}) {
  return {
    ...createStructuredIllustrationCardsFactory(dependencies),
    ...createStructuredIllustrationResidualsFactory(dependencies)
  };
}

module.exports = { createStructuredIllustrationFactory };
