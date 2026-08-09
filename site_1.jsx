import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import emailjs from "@emailjs/browser";
import { supabase } from "./supabaseClient";
import { useAuth } from "./src/AuthContext.jsx";

// ─── Data ────────────────────────────────────────────────────────────────────
// The catalog, the lab summaries and the article metadata are plain data and
// now live in src/data/ so the build can import the very same values the app
// renders — see scripts/generate-seo-assets.js and scripts/prerender.js. Only
// the article bodies (JSX) stayed behind in this file.
import { PRODUCTS } from "./src/data/catalog.js";
import { LAB_RESULTS } from "./src/data/lab-results.js";
import { ARTICLE_META } from "./src/data/articles.js";
import { SITE_DOMAIN, CONTACT_EMAIL, DEFAULT_TITLE, TITLE_SUFFIX } from "./src/data/site.js";
import {
  routeMeta,
  productMeta,
  articleMeta,
  canonicalUrl,
  isPublished,
} from "./src/data/routes.js";
import { productGraph, articleGraph } from "./src/data/structured-data.js";

// The thirteen article bodies are about a fifth of the application by weight
// and are only ever needed on /research/:slug. Loading them lazily keeps them
// out of the bundle that the homepage, the catalog and the checkout download.
const ArticleBody = lazy(() => import("./src/ArticleBody.jsx"));
import {
  SITEWIDE_SALE,
  isSaleActive,
  applySale,
  catalogPrices,
  formatSaleEndDate,
} from "./src/data/pricing.js";
import { getLabResults, isLabResultWithheld } from "./src/data/lab-integrity.js";
import { readStoredCart, clampQuantity, MAX_CART_QUANTITY } from "./src/data/cart.js";
import {
  lineUnitPrice,
  orderTotals,
  FREE_SHIPPING_THRESHOLD,
  isShippingDiscountCode,
} from "./src/data/order-totals.js";

// ─── Molecular Profiles (per compound) ────────────────────────────────────────
const MOLECULAR_PROFILES = {
  "BPC-157": {
    type: "Synthetic pentadecapeptide (Body Protection Compound)",
    aminoAcids: "15 — Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
    molecularWeight: "1,419.55 g/mol",
    casNumber: "137525-51-0",
    molecularFormula: "C₆₂H₉₈N₁₆O₂₂",
    modification: "Free peptide (acetate salt form for storage)",
    pubchemCID: "9941957",
  },
  "GLP-3RT": {
    type: "Triple incretin receptor agonist (GLP-1 / GIP / Glucagon) — known generically as Retatrutide / LY-3437943",
    aminoAcids: "39 (modified GLP-1 backbone with Aib & α-Me-Leu substitutions)",
    molecularWeight: "4,894.58 g/mol",
    casNumber: "2381089-83-2",
    molecularFormula: "C₂₂₈H₃₅₀N₄₈O₆₆",
    modification: "C20 diacid fatty-acid acylation via γ-Glu-AEEA linker on Lys17",
    pubchemCID: "162363932",
  },
  "Tesamorelin": {
    type: "Synthetic growth hormone-releasing factor (GRF) analogue",
    aminoAcids: "44 (human GRF 1-44 sequence)",
    molecularWeight: "5,135.9 g/mol",
    casNumber: "218949-48-5",
    molecularFormula: "C₂₂₁H₃₆₆N₇₂O₆₇S",
    modification: "trans-3-hexenoyl group on N-terminal tyrosine",
    pubchemCID: "16159350",
  },
  "CJC-1295 / Ipamorelin": {
    type: "Blend — CJC-1295 (Mod GRF 1-29, growth hormone secretagogue) + Ipamorelin (selective ghrelin receptor agonist)",
    aminoAcids: "29 (CJC-1295) + 5 (Ipamorelin)",
    molecularWeight: "3,367.9 g/mol (CJC-1295) + 711.85 g/mol (Ipamorelin)",
    casNumber: "446036-97-1 (CJC-1295) · 170851-70-4 (Ipamorelin)",
    molecularFormula: "C₁₅₂H₂₅₂N₄₄O₄₂ + C₃₈H₄₉N₉O₅",
    modification: "Combined non-DAC formulation, equimolar dosing",
  },
  "TB-500": {
    type: "Synthetic N-acetylated active fragment of Thymosin β4 (residues 17–23) — actin-binding heptapeptide",
    aminoAcids: "7 — Ac-Leu-Lys-Lys-Thr-Glu-Thr-Gln",
    molecularWeight: "889.0 g/mol",
    casNumber: "77591-33-4",
    molecularFormula: "C₃₇H₆₂N₁₀O₁₄",
    modification: "N-terminal acetylation",
  },
  "Epitalon": {
    type: "Synthetic tetrapeptide (synthetic Epithalamin from pineal gland)",
    aminoAcids: "4 — Ala-Glu-Asp-Gly (AEDG)",
    molecularWeight: "390.35 g/mol",
    casNumber: "307297-39-8",
    molecularFormula: "C₁₄H₂₂N₄O₉",
    modification: "Free peptide",
    pubchemCID: "219042",
  },
  "GHK-Cu": {
    type: "Copper-binding tripeptide complex (Copper Tripeptide-1)",
    aminoAcids: "3 — Gly-His-Lys",
    molecularWeight: "403.9 g/mol (Cu²⁺ complex)",
    casNumber: "49557-75-7",
    molecularFormula: "C₁₄H₂₂CuN₆O₄",
    modification: "Coordinated with Cu²⁺ ion",
    pubchemCID: "73587",
  },
  "SS-31": {
    type: "Mitochondria-targeted tetrapeptide (also known as Elamipretide / Bendavia / MTP-131)",
    aminoAcids: "4 — D-Arg-Dmt-Lys-Phe-NH₂ (Dmt = 2',6'-dimethyltyrosine)",
    molecularWeight: "639.78 g/mol",
    casNumber: "736992-21-5",
    molecularFormula: "C₃₂H₄₉N₉O₅",
    modification: "C-terminal amidation; cationic-aromatic alternating motif binds cardiolipin",
    pubchemCID: "16124497",
  },
  "Ipamorelin": {
    type: "Selective growth hormone secretagogue (ghrelin receptor agonist)",
    aminoAcids: "5 — Aib-His-D-2-Nal-D-Phe-Lys-NH₂",
    molecularWeight: "711.85 g/mol",
    casNumber: "170851-70-4",
    molecularFormula: "C₃₈H₄₉N₉O₅",
    modification: "C-terminal amidation; Aib = 2-aminoisobutyric acid",
    pubchemCID: "9831659",
  },
  "Kisspeptin": {
    type: "C-terminal decapeptide of human metastin / KISS1 gene product",
    aminoAcids: "10 — Tyr-Asn-Trp-Asn-Ser-Phe-Gly-Leu-Arg-Phe-NH₂",
    molecularWeight: "1,302.4 g/mol",
    casNumber: "374675-21-5",
    molecularFormula: "C₆₃H₈₃N₁₇O₁₄",
    modification: "C-terminal amidation",
    pubchemCID: "11953861",
  },
  "MOTS-c": {
    type: "Mitochondrial-derived peptide (encoded by mitochondrial MT-RNR1 gene)",
    aminoAcids: "16 — Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg",
    molecularWeight: "2,174.6 g/mol",
    casNumber: "1627580-64-6",
    molecularFormula: "C₁₀₁H₁₅₂N₂₈O₂₂S₂",
    modification: "Free peptide; activates AMPK pathway",
    pubchemCID: "118767809",
  },
  "Selank": {
    type: "Synthetic anxiolytic / nootropic heptapeptide (Tuftsin analogue)",
    aminoAcids: "7 — Thr-Lys-Pro-Arg-Pro-Gly-Pro",
    molecularWeight: "751.87 g/mol",
    casNumber: "129954-34-3",
    molecularFormula: "C₃₃H₅₇N₁₁O₉",
    modification: "Free peptide; Pro-Gly-Pro C-terminal extension stabilises Tuftsin",
    pubchemCID: "11765637",
  },
  "Semax": {
    type: "Synthetic ACTH(4-10) analogue with C-terminal Pro-Gly-Pro tail (nootropic)",
    aminoAcids: "7 — Met-Glu-His-Phe-Pro-Gly-Pro",
    molecularWeight: "813.92 g/mol",
    casNumber: "80714-61-0",
    molecularFormula: "C₃₇H₅₁N₉O₁₀S",
    modification: "Pro-Gly-Pro C-terminal extension for proteolytic stability",
    pubchemCID: "11765643",
  },
  "MT-1": {
    type: "Linear synthetic α-MSH analogue (Afamelanotide) — MC1R agonist",
    aminoAcids: "13 — Ac-Ser-Tyr-Ser-Nle-Glu-His-D-Phe-Arg-Trp-Gly-Lys-Pro-Val-NH₂",
    molecularWeight: "1,646.85 g/mol",
    casNumber: "75921-69-6",
    molecularFormula: "C₇₈H₁₁₁N₂₁O₁₉",
    modification: "N-terminal acetylation, C-terminal amidation, Nle (norleucine) at position 4",
    pubchemCID: "16154950",
  },
  "MT-2": {
    type: "Cyclic synthetic α-MSH analogue — MC3R / MC4R full agonist",
    aminoAcids: "7 — Ac-Nle-c[Asp-His-D-Phe-Arg-Trp-Lys]-NH₂ (cyclic lactam)",
    molecularWeight: "1,024.18 g/mol",
    casNumber: "121062-08-6",
    molecularFormula: "C₅₀H₆₉N₁₅O₉",
    modification: "Cyclic lactam between Asp and Lys side-chains; N-Ac, C-NH₂",
    pubchemCID: "16154980",
  },
  "Thymosin Alpha 1": {
    type: "Synthetic 28-amino-acid immunomodulating peptide (Thymalfasin)",
    aminoAcids: "28 — Ac-Ser-Asp-Ala-Ala-Val-Asp-Thr-Ser-Ser-Glu-Ile-Thr-Thr-Lys-Asp-Leu-Lys-Glu-Lys-Lys-Glu-Val-Val-Glu-Glu-Ala-Glu-Asn",
    molecularWeight: "3,108.28 g/mol",
    casNumber: "62304-98-7",
    molecularFormula: "C₁₂₉H₂₁₅N₃₃O₅₅",
    modification: "N-terminal acetylation; enhances Th1 immune response",
    pubchemCID: "16130571",
  },
  "IGF-1 LR3": {
    type: "Synthetic Long R3 IGF-1 analogue (Insulin-like Growth Factor-1, Long Arg³)",
    aminoAcids: "83 (13-residue N-terminal extension + IGF-1 backbone with Arg substitution at position 3)",
    molecularWeight: "9,117.5 g/mol",
    casNumber: "946870-92-4",
    molecularFormula: "C₄₀₀H₆₂₅N₁₁₁O₁₁₅S₉",
    modification: "13-aa N-terminal extension; Glu3 → Arg3 substitution (low IGFBP affinity, ~3× more potent than IGF-1)",
  },
  "KPV": {
    type: "C-terminal tripeptide fragment of α-MSH (anti-inflammatory, non-pigmenting)",
    aminoAcids: "3 — Lys-Pro-Val",
    molecularWeight: "342.44 g/mol",
    casNumber: "67727-97-3",
    molecularFormula: "C₁₆H₃₀N₄O₄",
    modification: "Free peptide; does not bind melanocortin receptors",
    pubchemCID: "125672",
  },
  "NAD+": {
    type: "Pyridine nucleotide coenzyme (not a peptide) — electron carrier in cellular metabolism",
    aminoAcids: null,
    molecularWeight: "663.43 g/mol",
    casNumber: "53-84-9",
    molecularFormula: "C₂₁H₂₇N₇O₁₄P₂",
    modification: "Ribosylnicotinamide-5′-diphosphate coupled to adenosine-5′-phosphate",
    pubchemCID: "5893",
  },
  "HCG": {
    type: "Glycoprotein hormone (not a single peptide) — heterodimer of α and β subunits",
    aminoAcids: "237 total — α subunit (92 aa) + β subunit (145 aa)",
    molecularWeight: "~36,700 Da (36.7 kDa); 25–40% carbohydrate by mass",
    casNumber: "9002-61-3",
    molecularFormula: null,
    modification: "Heavily glycosylated; α subunit identical to LH/FSH/TSH α",
  },
  "GLOW": {
    type: "Multi-target tissue repair and regeneration blend",
    totalContent: "70 mg/vial",
    form: "Lyophilized blend",
    components: [
      { name: "BPC-157", dose: "10 mg", role: "Gastric pentadecapeptide — gut and joint repair" },
      { name: "GHK-Cu", dose: "50 mg", role: "Copper tripeptide — skin, collagen, anti-inflammatory" },
      { name: "TB-500", dose: "10 mg", role: "Thymosin β4 fragment — actin binding, wound healing" },
    ],
  },
  "KLOW": {
    type: "Multi-target tissue repair, regeneration & anti-inflammatory blend",
    totalContent: "80 mg/vial",
    form: "Lyophilized blend",
    components: [
      { name: "BPC-157", dose: "10 mg", role: "Gastric pentadecapeptide — gut and joint repair" },
      { name: "GHK-Cu", dose: "50 mg", role: "Copper tripeptide — skin, collagen, anti-inflammatory" },
      { name: "TB-500", dose: "10 mg", role: "Thymosin β4 fragment — actin binding, wound healing" },
      { name: "KPV", dose: "10 mg", role: "α-MSH tripeptide — anti-inflammatory" },
    ],
  },
};

// ─── Research References (per compound) ───────────────────────────────────────
const REFERENCES = {
  "BPC-157": [
    { journal: "PHARMACEUTICALS", title: "Multifunctionality and Possible Medical Application of the BPC 157 Peptide — Literature and Patent Review", year: 2025, identifier: "PMC11859134", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11859134/" },
    { journal: "PHARMACEUTICS", title: "BPC-157 as an Investigational Peptide Therapeutic: Biopharmaceutical Challenges, Formulation Strategies, and Translational Development Barriers", year: 2025, identifier: "DOI: 10.3390/pharmaceutics18050625", url: "https://doi.org/10.3390/pharmaceutics18050625" },
    { journal: "FRONT PHARMACOL", title: "Stable Gastric Pentadecapeptide BPC 157 and Wound Healing", year: 2021, identifier: "PMID: 34267654", authors: "Seiwerth S et al.", url: "https://pubmed.ncbi.nlm.nih.gov/34267654/" },
    { journal: "INFLAMMOPHARMACOLOGY", title: "Concerning BPC-157, a natural pentadecapeptide, that acts as a cytoprotectant and is believed to protect the gastro-intestinal tract", year: 2025, identifier: "PMID: 40759852", authors: "Whitehouse M", url: "https://pubmed.ncbi.nlm.nih.gov/40759852/" },
    { journal: "MEDICINA (KAUNAS)", title: "Protective Effects of BPC 157 on Liver, Kidney, and Lung Distant Organ Damage in Rats with Experimental Lower-Extremity Ischemia-Reperfusion Injury", year: 2025, identifier: "PMC11857380", authors: "Demirtaş H et al.", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11857380/" },
    { journal: "PUBCHEM", title: "BPC-157 — CID 9941957", identifier: "CID 9941957", url: "https://pubchem.ncbi.nlm.nih.gov/compound/9941957" },
  ],
  "GLP-3RT": [
    { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Coadministered Retatrutide and Semaglutide in Adults with Overweight or Obesity", year: 2025, identifier: "DOI: 10.1056/NEJMoa2502081", authors: "Garvey WT et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa2502081" },
    { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Triple–Hormone-Receptor Agonist Retatrutide for Obesity — A Phase 2 Trial", year: 2023, identifier: "DOI: 10.1056/NEJMoa2301972", authors: "Jastreboff AM et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa2301972" },
    { journal: "THE LANCET", title: "Retatrutide, a GIP/GLP-1/glucagon receptor agonist, for people with type 2 diabetes: a randomised, double-blind, placebo and active-controlled, phase 2 trial", year: 2023, identifier: "DOI: 10.1016/S0140-6736(23)01053-X", authors: "Rosenstock J et al.", url: "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(23)01053-X/fulltext" },
    { journal: "WIKIPEDIA", title: "Retatrutide", url: "https://en.wikipedia.org/wiki/Retatrutide" },
    { journal: "PUBCHEM", title: "Retatrutide — CID 162363932", identifier: "CID 162363932", url: "https://pubchem.ncbi.nlm.nih.gov/compound/162363932" },
  ],
  "Tesamorelin": [
    { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Effects of Tesamorelin (TH9507), a Growth Hormone-Releasing Factor Analog, in HIV-Infected Patients with Excess Abdominal Fat", year: 2007, identifier: "DOI: 10.1056/NEJMoa073538", authors: "Falutz J et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa073538" },
    { journal: "AIDS", title: "Long-term safety and effects of tesamorelin, a growth hormone-releasing factor analogue, in HIV patients with abdominal fat accumulation", year: 2008, identifier: "PMID: 18690162", authors: "Falutz J et al.", url: "https://pubmed.ncbi.nlm.nih.gov/18690162/" },
    { journal: "WIKIPEDIA", title: "Tesamorelin", url: "https://en.wikipedia.org/wiki/Tesamorelin" },
    { journal: "PUBCHEM", title: "Tesamorelin Acetate — CID 16159350", identifier: "CID 16159350", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16159350" },
  ],
  "CJC-1295 / Ipamorelin": [
    { journal: "J CLIN ENDOCRINOL METAB", title: "Sustained effects of CJC-1295, a long-acting growth hormone-releasing hormone analog, on growth hormone and insulin-like growth factor I in healthy adults", year: 2006, identifier: "PMID: 16352683", authors: "Teichman SL et al.", url: "https://pubmed.ncbi.nlm.nih.gov/16352683/" },
    { journal: "EUR J ENDOCRINOL", title: "Ipamorelin, the first selective growth hormone secretagogue", year: 1998, identifier: "PMID: 9849822", authors: "Raun K et al.", url: "https://pubmed.ncbi.nlm.nih.gov/9849822/" },
    { journal: "WIKIPEDIA", title: "CJC-1295", url: "https://en.wikipedia.org/wiki/CJC-1295" },
    { journal: "WIKIPEDIA", title: "Ipamorelin", url: "https://en.wikipedia.org/wiki/Ipamorelin" },
  ],
  "TB-500": [
    { journal: "EXPERT OPIN BIOL THER", title: "Thymosin β4: a multi-functional regenerative peptide. Basic properties and clinical applications", year: 2012, identifier: "PMID: 22074294", authors: "Goldstein AL, Hannappel E, Sosne G, Kleinman HK", url: "https://pubmed.ncbi.nlm.nih.gov/22074294/" },
    { journal: "ANN N Y ACAD SCI", title: "A randomized, placebo-controlled, single and multiple dose study of intravenous thymosin β4 in healthy volunteers", year: 2010, identifier: "PMID: 20536472", authors: "Ruff D, Crockford D, Girardi G, Zhang Y", url: "https://pubmed.ncbi.nlm.nih.gov/20536472/" },
    { journal: "WIKIPEDIA", title: "TB-500", url: "https://en.wikipedia.org/wiki/TB-500" },
  ],
  "Epitalon": [
    { journal: "NEUROENDOCRINOL LETT", title: "Synthetic tetrapeptide epitalon restores disturbed neuroendocrine regulation in senescent monkeys", year: 2001, identifier: "PMID: 11524632", authors: "Khavinson V, Goncharova N, Lapin B", url: "https://pubmed.ncbi.nlm.nih.gov/11524632/" },
    { journal: "BULL EXP BIOL MED", title: "Epithalon peptide induces telomerase activity and telomere elongation in human somatic cells", year: 2003, identifier: "PMID: 12937682", authors: "Khavinson VKh, Bondarev IE, Butyugov AA", url: "https://pubmed.ncbi.nlm.nih.gov/12937682/" },
    { journal: "PUBCHEM", title: "Epithalon — CID 219042", identifier: "CID 219042", url: "https://pubchem.ncbi.nlm.nih.gov/compound/219042" },
  ],
  "GHK-Cu": [
    { journal: "COSMETICS", title: "GHK-Cu may Prevent Oxidative Stress in Skin by Regulating Copper and Modifying Expression of Numerous Antioxidant Genes", year: 2015, identifier: "DOI: 10.3390/cosmetics2030236", authors: "Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://doi.org/10.3390/cosmetics2030236" },
    { journal: "BRAIN SCI", title: "The Effect of the Human Peptide GHK on Gene Expression Relevant to Nervous System Function and Cognitive Decline", year: 2017, identifier: "PMID: 28212278", authors: "Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://pubmed.ncbi.nlm.nih.gov/28212278/" },
    { journal: "WIKIPEDIA", title: "Copper peptide GHK-Cu", url: "https://en.wikipedia.org/wiki/Copper_peptide_GHK-Cu" },
    { journal: "PUBCHEM", title: "GHK-Cu Copper Tripeptide — CID 73587", identifier: "CID 73587", url: "https://pubchem.ncbi.nlm.nih.gov/compound/73587" },
  ],
  "SS-31": [
    { journal: "FDA NEWS RELEASE", title: "FDA approves Elamipretide (SS-31) for Barth syndrome", year: 2025, identifier: "Approved September 2025", url: "https://www.fda.gov/drugs/news-events-human-drugs/fda-approves-first-treatment-barth-syndrome" },
    { journal: "BR J PHARMACOL", title: "First-in-class cardiolipin-protective compound as a therapeutic agent to restore mitochondrial bioenergetics", year: 2014, identifier: "PMID: 24117165", authors: "Szeto HH", url: "https://pubmed.ncbi.nlm.nih.gov/24117165/" },
    { journal: "WIKIPEDIA", title: "Elamipretide", url: "https://en.wikipedia.org/wiki/Elamipretide" },
    { journal: "PUBCHEM", title: "Elamipretide — CID 16124497", identifier: "CID 16124497", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16124497" },
  ],
  "Ipamorelin": [
    { journal: "EUR J ENDOCRINOL", title: "Ipamorelin, the first selective growth hormone secretagogue", year: 1998, identifier: "PMID: 9849822", authors: "Raun K et al.", url: "https://pubmed.ncbi.nlm.nih.gov/9849822/" },
    { journal: "WIKIPEDIA", title: "Ipamorelin", url: "https://en.wikipedia.org/wiki/Ipamorelin" },
    { journal: "PUBCHEM", title: "Ipamorelin — CID 9831659", identifier: "CID 9831659", url: "https://pubchem.ncbi.nlm.nih.gov/compound/9831659" },
  ],
  "Kisspeptin": [
    { journal: "J CLIN ENDOCRINOL METAB", title: "Exogenous kisspeptin administration as a probe of GnRH neuronal function in patients with idiopathic hypogonadotropic hypogonadism", year: 2014, identifier: "PMID: 25226293", authors: "Chan YM et al.", url: "https://pubmed.ncbi.nlm.nih.gov/25226293/" },
    { journal: "PHYSIOL REV", title: "Kisspeptins and reproduction: physiological roles and regulatory mechanisms", year: 2012, identifier: "PMID: 22811428", authors: "Pinilla L, Aguilar E, Dieguez C, Millar RP, Tena-Sempere M", url: "https://pubmed.ncbi.nlm.nih.gov/22811428/" },
    { journal: "WIKIPEDIA", title: "Kisspeptin", url: "https://en.wikipedia.org/wiki/Kisspeptin" },
    { journal: "PUBCHEM", title: "Kisspeptin-10 — CID 11953861", identifier: "CID 11953861", url: "https://pubchem.ncbi.nlm.nih.gov/compound/11953861" },
  ],
  "MOTS-c": [
    { journal: "CELL METAB", title: "The mitochondrial-derived peptide MOTS-c promotes metabolic homeostasis and reduces obesity and insulin resistance", year: 2015, identifier: "PMID: 25738459", authors: "Lee C et al.", url: "https://pubmed.ncbi.nlm.nih.gov/25738459/" },
    { journal: "FRONT ENDOCRINOL", title: "MOTS-c: A promising mitochondrial-derived peptide for therapeutic exploitation", year: 2023, identifier: "PMC9905433", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9905433/" },
    { journal: "WIKIPEDIA", title: "MOTS-c", url: "https://en.wikipedia.org/wiki/MOTS-c" },
  ],
  "Selank": [
    { journal: "ZH NEVROL PSIKHIATR IM S S KORSAKOVA", title: "A comparison of the anxiolytic effect and tolerability of selank and phenazepam in the treatment of anxiety disorders", year: 2014, identifier: "PMID: 25176261", authors: "Medvedev VE et al.", url: "https://pubmed.ncbi.nlm.nih.gov/25176261/" },
    { journal: "EKSP KLIN FARMAKOL", title: "Effects of heptapeptide selank on the content of monoamines and their metabolites in the brain of BALB/C and C57Bl/6 mice: a comparative study", year: 2008, identifier: "PMID: 19093364", authors: "Narkevich VB et al.", url: "https://pubmed.ncbi.nlm.nih.gov/19093364/" },
    { journal: "WIKIPEDIA", title: "Selank", url: "https://en.wikipedia.org/wiki/Selank" },
  ],
  "Semax": [
    { journal: "BRAIN RES", title: "Semax, an analog of ACTH(4-10) with cognitive effects, regulates BDNF and trkB expression in the rat hippocampus", year: 2006, identifier: "PMID: 16996037", authors: "Dolotov OV et al.", url: "https://pubmed.ncbi.nlm.nih.gov/16996037/" },
    { journal: "CELL MOL NEUROBIOL", title: "Semax and Pro-Gly-Pro activate the transcription of neurotrophins and their receptor genes after cerebral ischemia", year: 2010, identifier: "PMID: 19633950", authors: "Dmitrieva VG et al.", url: "https://pubmed.ncbi.nlm.nih.gov/19633950/" },
    { journal: "WIKIPEDIA", title: "Semax", url: "https://en.wikipedia.org/wiki/Semax" },
  ],
  "MT-1": [
    { journal: "NEW ENGLAND JOURNAL OF MEDICINE", title: "Afamelanotide for Erythropoietic Protoporphyria", year: 2015, identifier: "DOI: 10.1056/NEJMoa1411481", authors: "Langendonk JG et al.", url: "https://www.nejm.org/doi/10.1056/NEJMoa1411481" },
    { journal: "WIKIPEDIA", title: "Afamelanotide", url: "https://en.wikipedia.org/wiki/Afamelanotide" },
    { journal: "PUBCHEM", title: "Afamelanotide — CID 16154950", identifier: "CID 16154950", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16154950" },
  ],
  "MT-2": [
    { journal: "ANN N Y ACAD SCI", title: "PT-141: a melanocortin agonist for the treatment of sexual dysfunction", year: 2003, identifier: "PMID: 12851303", authors: "Molinoff PB et al.", url: "https://pubmed.ncbi.nlm.nih.gov/12851303/" },
    { journal: "WIKIPEDIA", title: "Melanotan II", url: "https://en.wikipedia.org/wiki/Melanotan_II" },
    { journal: "PUBCHEM", title: "Melanotan II — CID 16154980", identifier: "CID 16154980", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16154980" },
  ],
  "Thymosin Alpha 1": [
    { journal: "ANN N Y ACAD SCI", title: "Thymosin α1: from bench to bedside", year: 2007, identifier: "PMID: 17600290", authors: "Garaci E et al.", url: "https://pubmed.ncbi.nlm.nih.gov/17600290/" },
    { journal: "EXPERT OPIN BIOL THER", title: "Historical review on thymosin α1 in oncology: preclinical and clinical experiences", year: 2015, identifier: "PMID: 26096345", authors: "Garaci E et al.", url: "https://pubmed.ncbi.nlm.nih.gov/26096345/" },
    { journal: "WIKIPEDIA", title: "Thymalfasin", url: "https://en.wikipedia.org/wiki/Thymalfasin" },
    { journal: "PUBCHEM", title: "Thymosin α1 — CID 16130571", identifier: "CID 16130571", url: "https://pubchem.ncbi.nlm.nih.gov/compound/16130571" },
  ],
  "IGF-1 LR3": [
    { journal: "J MOL ENDOCRINOL", title: "Novel recombinant fusion protein analogues of insulin-like growth factor (IGF)-I indicate the relative importance of IGF-binding protein and receptor binding for enhanced biological potency", year: 1992, identifier: "PMID: 1378742", authors: "Francis GL et al.", url: "https://pubmed.ncbi.nlm.nih.gov/1378742/" },
    { journal: "WIKIPEDIA", title: "IGF-1 LR3", url: "https://en.wikipedia.org/wiki/IGF-1_LR3" },
  ],
  "KPV": [
    { journal: "ENDOCR REV", title: "Alpha-melanocyte-stimulating hormone and related tripeptides: biochemistry, antiinflammatory and protective effects in vitro and in vivo", year: 2008, identifier: "PMID: 18612139", authors: "Brzoska T, Luger TA, Maaser C, Abels C, Böhm M", url: "https://pubmed.ncbi.nlm.nih.gov/18612139/" },
    { journal: "GASTROENTEROLOGY", title: "PepT1-mediated tripeptide KPV uptake reduces intestinal inflammation", year: 2008, identifier: "PMID: 18061177", authors: "Dalmasso G et al.", url: "https://pubmed.ncbi.nlm.nih.gov/18061177/" },
    { journal: "WIKIPEDIA", title: "KPV tripeptide", url: "https://en.wikipedia.org/wiki/KPV_tripeptide" },
    { journal: "PUBCHEM", title: "KPV — CID 125672", identifier: "CID 125672", url: "https://pubchem.ncbi.nlm.nih.gov/compound/125672" },
  ],
  "NAD+": [
    { journal: "NAT REV MOL CELL BIOL", title: "NAD+ metabolism and its roles in cellular processes during ageing", year: 2021, identifier: "PMID: 33353981", authors: "Covarrubias AJ, Perrone R, Grozio A, Verdin E", url: "https://pubmed.ncbi.nlm.nih.gov/33353981/" },
    { journal: "WIKIPEDIA", title: "Nicotinamide adenine dinucleotide", url: "https://en.wikipedia.org/wiki/Nicotinamide_adenine_dinucleotide" },
    { journal: "PUBCHEM", title: "NAD+ — CID 5893", identifier: "CID 5893", url: "https://pubchem.ncbi.nlm.nih.gov/compound/5893" },
  ],
  "HCG": [
    { journal: "INT J MOL SCI", title: "hCG: Biological Functions and Clinical Applications", year: 2017, identifier: "PMC5666719", authors: "Nwabuobi C et al.", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5666719/" },
    { journal: "WIKIPEDIA", title: "Human chorionic gonadotropin", url: "https://en.wikipedia.org/wiki/Human_chorionic_gonadotropin" },
  ],
  "GLOW": [
    { journal: "PHARMACEUTICALS", title: "Multifunctionality and Possible Medical Application of the BPC 157 Peptide — Literature and Patent Review", year: 2025, identifier: "PMC11859134", authors: "BPC-157 component", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11859134/" },
    { journal: "FRONT PHARMACOL", title: "Stable Gastric Pentadecapeptide BPC 157 and Wound Healing", year: 2021, identifier: "PMID: 34267654", authors: "BPC-157 component · Seiwerth S et al.", url: "https://pubmed.ncbi.nlm.nih.gov/34267654/" },
    { journal: "COSMETICS", title: "GHK-Cu may Prevent Oxidative Stress in Skin by Regulating Copper and Modifying Expression of Numerous Antioxidant Genes", year: 2015, identifier: "DOI: 10.3390/cosmetics2030236", authors: "GHK-Cu component · Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://doi.org/10.3390/cosmetics2030236" },
    { journal: "BRAIN SCI", title: "The Effect of the Human Peptide GHK on Gene Expression Relevant to Nervous System Function and Cognitive Decline", year: 2017, identifier: "PMID: 28212278", authors: "GHK-Cu component · Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://pubmed.ncbi.nlm.nih.gov/28212278/" },
    { journal: "EXPERT OPIN BIOL THER", title: "Thymosin β4: a multi-functional regenerative peptide. Basic properties and clinical applications", year: 2012, identifier: "PMID: 22074294", authors: "TB-500 component · Goldstein AL, Hannappel E, Sosne G, Kleinman HK", url: "https://pubmed.ncbi.nlm.nih.gov/22074294/" },
    { journal: "ANN N Y ACAD SCI", title: "A randomized, placebo-controlled, single and multiple dose study of intravenous thymosin β4 in healthy volunteers", year: 2010, identifier: "PMID: 20536472", authors: "TB-500 component · Ruff D, Crockford D, Girardi G, Zhang Y", url: "https://pubmed.ncbi.nlm.nih.gov/20536472/" },
  ],
  "KLOW": [
    { journal: "PHARMACEUTICALS", title: "Multifunctionality and Possible Medical Application of the BPC 157 Peptide — Literature and Patent Review", year: 2025, identifier: "PMC11859134", authors: "BPC-157 component", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11859134/" },
    { journal: "FRONT PHARMACOL", title: "Stable Gastric Pentadecapeptide BPC 157 and Wound Healing", year: 2021, identifier: "PMID: 34267654", authors: "BPC-157 component · Seiwerth S et al.", url: "https://pubmed.ncbi.nlm.nih.gov/34267654/" },
    { journal: "COSMETICS", title: "GHK-Cu may Prevent Oxidative Stress in Skin by Regulating Copper and Modifying Expression of Numerous Antioxidant Genes", year: 2015, identifier: "DOI: 10.3390/cosmetics2030236", authors: "GHK-Cu component · Pickart L, Vasquez-Soltero JM, Margolina A", url: "https://doi.org/10.3390/cosmetics2030236" },
    { journal: "EXPERT OPIN BIOL THER", title: "Thymosin β4: a multi-functional regenerative peptide. Basic properties and clinical applications", year: 2012, identifier: "PMID: 22074294", authors: "TB-500 component · Goldstein AL, Hannappel E, Sosne G, Kleinman HK", url: "https://pubmed.ncbi.nlm.nih.gov/22074294/" },
    { journal: "ENDOCR REV", title: "Alpha-melanocyte-stimulating hormone and related tripeptides: biochemistry, antiinflammatory and protective effects in vitro and in vivo", year: 2008, identifier: "PMID: 18612139", authors: "KPV component · Brzoska T, Luger TA, Maaser C, Abels C, Böhm M", url: "https://pubmed.ncbi.nlm.nih.gov/18612139/" },
    { journal: "GASTROENTEROLOGY", title: "PepT1-mediated tripeptide KPV uptake reduces intestinal inflammation", year: 2008, identifier: "PMID: 18061177", authors: "KPV component · Dalmasso G et al.", url: "https://pubmed.ncbi.nlm.nih.gov/18061177/" },
  ],
};

function getMolecularProfile(productName) {
  return MOLECULAR_PROFILES[productName] || null;
}

function getReferences(productName) {
  return REFERENCES[productName] || null;
}

// ─── Research Articles ────────────────────────────────────────────────────────
// Long-form research review articles, keyed by URL slug. Adding a new article =
// adding a new entry to this array. Each `content` is a function returning JSX
// so we can keep articles readable inline.
// ARTICLES:START — do not remove. scripts/check-diff-scope.js uses these two
// markers to decide which lines an automated article PR is allowed to touch.
// Bracket-matching the array would be fooled by brackets inside JSX and
// strings; a literal sentinel cannot be.
// Article bodies live in src/article-content.jsx and are loaded on demand;
// see the ArticleBody lazy import above. ARTICLES therefore carries metadata
// only — nothing in the listing pages ever needed the body text.
const ARTICLES = ARTICLE_META;
// ARTICLES:END — do not remove. See the note at ARTICLES:START.

// ─── Scheduled publishing ────────────────────────────────────────────────────
// An article whose `date` is in the future is written and shipped in the bundle
// but not yet public. The check below runs in the browser on every visit, so an
// article goes live by itself on its own date — no deploy, no build, no cron.
// Queue articles with staggered dates and the page publishes on its own.
//
// Every read of ARTICLES must go through publishedArticles() or
// getArticleBySlug(). Reading the raw array anywhere else would leak a queued
// article early — the whole queue is in the bundle, so the date check is the
// only thing keeping unpublished articles out of sight.
// todayISO() and isPublished() live in src/data/routes.js so the build uses the
// very same gate — otherwise a queued article could be absent from the site but
// present in the sitemap, which is a direct invitation for Google to index a
// 404.

function publishedArticles() {
  // Wrapped, not passed by reference: Array.filter calls back with
  // (element, index, array), so `ARTICLES.filter(isPublished)` fed the index
  // into isPublished's `today` parameter and hid every article.
  return ARTICLES.filter(article => isPublished(article));
}

function getArticleBySlug(slug) {
  const article = ARTICLES.find(a => a.slug === slug) || null;
  // Queued articles 404 rather than render. Slugs are guessable, and a draft
  // reachable by typing its URL is not scheduled — it is just published early.
  return article && isPublished(article) ? article : null;
}

// ─── Scroll Reveal Hook ──────────────────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    document.querySelectorAll(".scroll-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ─── Animated Count-Up Component ─────────────────────────────────────────────
function CountUp({ end, duration = 1500, suffix = "", prefix = "", start = true }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    if (!start) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = performance.now();
          const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(end * eased));
            if (progress < 1) requestAnimationFrame(animate);
            else setCount(end);
          };
          requestAnimationFrame(animate);
        }
      });
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration, start]);
  return <span ref={ref}>{prefix}{count}{suffix}</span>;
}

// ─── Page Title & Meta Helper ─────────────────────────────────────────────────
// SITE_DOMAIN is imported from src/data/site.js so the prerenderer and the app
// cannot drift on what the canonical host is.

// `image` is a site-relative path (e.g. "/bpc157-10.jpg"); `type` is the
// OpenGraph type, "article" on research pages and "website" everywhere else.
function usePageMeta(title, description, options = {}) {
  const { image, type = "website", noindex = false } = options;
  useEffect(() => {
    const suffix = TITLE_SUFFIX;
    const fullTitle = title ? title + suffix : DEFAULT_TITLE;
    document.title = fullTitle;

    // Find-or-create. The previous version only wrote to tags that already
    // existed in index.html and silently did nothing otherwise, which is why
    // og:image never appeared on any page — the tag was never in the HTML.
    const upsertMeta = (attr, key, value) => {
      if (!value) return;
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };

    // The canonical URL has to name THIS page. index.html hardcodes the
    // homepage, and nothing used to update it, so every article was telling
    // Google "I am a duplicate of /" — an instruction to drop the article from
    // the index in the homepage's favour. Query strings and trailing slashes
    // are stripped so ?ref=... variants collapse onto one canonical address.
    const canonical = canonicalUrl(window.location.pathname);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonical);

    const absoluteImage = image
      ? (image.startsWith("http") ? image : `${SITE_DOMAIN}${image}`)
      : `${SITE_DOMAIN}/logo-wide.png`;

    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:image", absoluteImage);
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", absoluteImage);

    // Cart, login, signup and account pages are useless as search results and
    // dilute the pages that matter, so they are served but never indexed. The
    // prerendered HTML carries the same directive — see scripts/prerender.js.
    upsertMeta("name", "robots", noindex ? "noindex, follow" : "index, follow");

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description, image, type, noindex]);
}

// Replaces the route-level JSON-LD in the document head.
//
// The prerendered HTML ships with the correct graph already in place, tagged
// data-tier1-ld. On a client-side navigation that tag is now describing the
// page the customer just left, so it is removed before the new graph goes in.
// Returns a cleanup function for useEffect.
function applyRouteJsonLd(graph) {
  document.querySelectorAll("script[data-tier1-ld]").forEach(el => el.remove());
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.setAttribute("data-tier1-ld", "");
  script.textContent = JSON.stringify(graph);
  document.head.appendChild(script);
  return () => script.remove();
}

// Static pages take their title and description from the shared route table so
// the prerendered HTML and the client-rendered page cannot drift apart.
function useRouteMeta(path) {
  const meta = routeMeta(path);
  usePageMeta(meta.title, meta.description, { noindex: meta.noindex, image: meta.image, type: meta.type });
  return meta;
}

// ─── Fonts via CDN ───────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// ─── Styles ──────────────────────────────────────────────────────────────────
const style = document.createElement("style");
style.textContent = `
  :root {
    --bg-primary: #090a0c;
    --bg-card: #111316;
    --bg-card-hover: #181b20;
    --bg-modal: #0d0f12;
    --red-primary: #d93642;
    --red-glow: #ff5964;
    --red-dark: #9f1e29;
    --text-primary: #f4f6f8;
    --text-secondary: #a8afb9;
    --text-dim: #7f8792;
    --border: #292d33;
    --border-hover: #3b414a;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Rajdhani', sans-serif;
    font-weight: 500;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
  }

  #root { min-height: 100vh; }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-primary); }
  ::-webkit-scrollbar-thumb { background: var(--red-dark); border-radius: 3px; }

  ::selection { background: rgba(217, 54, 66, 0.35); color: #fff; }
  ::placeholder { color: #747c87; opacity: 1; }

  a:focus-visible,
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  [role="button"]:focus-visible {
    outline: 2px solid var(--red-glow);
    outline-offset: 3px;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(60px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(196, 30, 42, 0.15); }
    50% { box-shadow: 0 0 40px rgba(196, 30, 42, 0.3); }
  }

  @keyframes scanLine {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100%); }
  }

  @keyframes borderGlow {
    0%, 100% { border-color: rgba(196, 30, 42, 0.2); }
    50% { border-color: rgba(196, 30, 42, 0.5); }
  }

  @keyframes heroZoom {
    0% { transform: scale(1.0); }
    100% { transform: scale(1.05); }
  }

  @keyframes redGlowBreathe {
    0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  }

  @keyframes pulseReturn {
    0%, 100% { background: rgba(34,197,94,0.08); }
    50% { background: rgba(34,197,94,0.18); }
  }

  @keyframes pulseConfirm {
    0% { box-shadow: 0 0 0 0 rgba(196,30,42,0.6); }
    70% { box-shadow: 0 0 0 14px rgba(196,30,42,0); }
    100% { box-shadow: 0 0 0 0 rgba(196,30,42,0); }
  }

  .article-body h2 {
    font-family: 'Orbitron', sans-serif;
    font-weight: 800;
    font-size: 24px;
    letter-spacing: 0.02em;
    color: var(--text-primary);
    margin-top: 38px;
    margin-bottom: 14px;
    line-height: 1.25;
  }
  .article-body h2:first-child { margin-top: 0; }
  .article-body h3 {
    font-family: 'Orbitron', sans-serif;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--red-primary);
    margin-top: 28px;
    margin-bottom: 10px;
  }
  .article-body p {
    margin: 0 0 18px;
  }
  .article-body ul {
    margin: 0 0 22px;
    padding-left: 22px;
  }
  .article-body li {
    margin-bottom: 8px;
  }
  .article-body strong {
    color: var(--text-primary);
    font-weight: 700;
  }
  .article-body a {
    color: var(--red-primary);
    text-decoration: none;
    border-bottom: 1px solid rgba(196,30,42,0.4);
  }
  .article-body a:hover {
    border-bottom-color: var(--red-primary);
  }

  /* Scroll reveal — hidden initially, revealed when .revealed is added */
  .scroll-reveal {
    opacity: 0;
    transform: translateY(40px);
    transition: opacity 0.8s ease-out, transform 0.8s ease-out;
  }
  .scroll-reveal.revealed {
    opacity: 1;
    transform: translateY(0);
  }

  /* Enhanced product card hover */
  .product-card-inner {
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .product-card:hover .product-card-inner {
    transform: scale(1.06);
  }
  .product-card {
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease, border-color 0.4s ease;
  }
  .product-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 16px 40px rgba(196, 30, 42, 0.15);
  }

  .product-card-title { overflow-wrap: anywhere; }

  .featured-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  .hero-grid-line {
    position: absolute;
    background: linear-gradient(to bottom, transparent, rgba(196,30,42,0.06), transparent);
    width: 1px;
    height: 100%;
    top: 0;
  }

  @media (max-width: 900px) {
    .featured-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  }

  @media (max-width: 640px) {
    .footer-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 32px 24px !important;
    }
    .footer-brand { grid-column: 1 / -1; }
  }

  @media (max-width: 520px) {
    .product-card-info { padding: 14px 12px 16px !important; }
    .product-card-title {
      font-size: 15px !important;
      letter-spacing: 0.03em !important;
      line-height: 1.2;
    }
    .product-card-price { font-size: 22px !important; }
    .product-card button {
      font-size: 11px !important;
      letter-spacing: 0.1em !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      scroll-behavior: auto !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
document.head.appendChild(style);

// ─── Components ──────────────────────────────────────────────────────────────

function CartPopup({ cart, visible, onClose }) {
  const navigate = useNavigate();
  if (!visible || cart.length === 0) return null;

  // Pricing comes from src/data/order-totals.js so the popup, the checkout and
  // the server all quote the same figure.
  const tieredPrice = lineUnitPrice;
  const subtotal = cart.reduce((sum, item) => sum + tieredPrice(item) * item.qty, 0);
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div style={{
      position: "fixed",
      top: 70,
      right: 20,
      width: 320,
      maxHeight: 420,
      background: "var(--bg-secondary, #141414)",
      border: "1px solid rgba(196,30,42,0.4)",
      borderRadius: 4,
      zIndex: 10000,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      animation: "fadeUp 0.3s ease-out",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid rgba(196,30,42,0.2)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
        }}>Item Added to Cart</span>
        <span onClick={onClose} style={{
          cursor: "pointer",
          color: "var(--text-dim)",
          fontSize: 18,
          lineHeight: 1,
        }}>&times;</span>
      </div>

      {/* Items */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px 16px",
      }}>
        {cart.map(item => (
          <div key={item.id} style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 0",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 4,
              overflow: "hidden",
              flexShrink: 0,
              border: "1px solid rgba(196,30,42,0.2)",
            }}>
              <img src={item.image} alt={item.name} style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-primary)",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>{item.name} {item.dose}</div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 13,
                color: "var(--text-dim)",
              }}>Qty: {item.qty}</div>
            </div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}>${(tieredPrice(item) * item.qty).toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid rgba(196,30,42,0.2)",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}>
          <span style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 14,
            color: "var(--text-dim)",
          }}>{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
          <span style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "0.04em",
          }}>${subtotal.toFixed(2)}</span>
        </div>
        <button onClick={() => { onClose(); navigate("/cart"); }} style={{
          width: "100%",
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.12em",
          padding: "12px 0",
          background: "var(--red-primary)",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
          textTransform: "uppercase",
          transition: "opacity 0.2s",
        }}>View Cart</button>
      </div>
    </div>
  );
}

function Header({ cartCount = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const accountLabel = isLoggedIn ? "Account" : "Sign In";
  const navPath = {
    Products: "/products",
    Research: "/research",
    "Lab Results": "/lab-results",
    Calculator: "/calculator",
    Contact: "/contact",
  };
  const isActiveNav = (item) => {
    const path = navPath[item];
    if (!path) return false;
    return item === "Products"
      ? location.pathname === path || location.pathname.startsWith("/product/")
      : location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  // Close menu when navigating
  const handleNav = (dest) => {
    setMenuOpen(false);
    if (dest === "Products") navigate("/products");
    else if (dest === "Lab Results") navigate("/lab-results");
    else if (dest === "Calculator") navigate("/calculator");
    else if (dest === "Research") navigate("/research");
    else if (dest === "Contact") navigate("/contact");
    else if (dest === "Cart") navigate("/cart");
    else if (dest === "Account") navigate(isLoggedIn ? "/account" : "/login");
    else if (dest === "Sign In") navigate("/login");
    else navigate("/");
  };

  return (
    <header style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      background: "linear-gradient(to bottom, rgba(10,10,10,0.98), rgba(10,10,10,0.92))",
      backdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(196,30,42,0.15)",
    }}>
      {isSaleActive() && (
        <div style={{
          background: "var(--red-primary)",
          color: "#fff",
          padding: isMobile ? "7px 12px" : "8px 24px",
          fontFamily: "'Orbitron', sans-serif",
          fontSize: isMobile ? 10 : 12,
          fontWeight: 700,
          letterSpacing: isMobile ? "0.1em" : "0.18em",
          textAlign: "center",
          textTransform: "uppercase",
          borderBottom: "1px solid rgba(0,0,0,0.25)",
          lineHeight: 1.4,
        }}>
          <span style={{ fontWeight: 800 }}>{SITEWIDE_SALE.headline}</span>
          <span style={{ opacity: 0.85, fontWeight: 500, letterSpacing: "0.08em", marginLeft: isMobile ? 6 : 12 }}>Ends {formatSaleEndDate(SITEWIDE_SALE.endDate)}</span>
        </div>
      )}
      <div style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: isMobile ? "4px 16px" : "4px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div
          onClick={() => { setMenuOpen(false); navigate("/"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <img
            src="/logo_transparent.png"
            alt="Tier One BioSystems"
            style={{
              height: isMobile ? 72 : 80,
              width: "auto",
              objectFit: "contain",
            }}
          />
        </div>

        <nav style={{ display: "flex", gap: isMobile ? 16 : 32, alignItems: "center" }}>
          {/* Desktop nav */}
          {!isMobile && ["Products", "Research", "Lab Results", "Calculator", "Contact"].map(item => (
            <span
              key={item}
              onClick={() => handleNav(item)}
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: isActiveNav(item) ? "var(--red-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "color 0.2s",
                position: "relative",
                borderBottom: isActiveNav(item) ? "1px solid var(--red-primary)" : "1px solid transparent",
                paddingBottom: 4,
              }}
              onMouseEnter={e => e.target.style.color = "var(--red-primary)"}
              onMouseLeave={e => e.target.style.color = isActiveNav(item) ? "var(--red-primary)" : "var(--text-secondary)"}
            >{item}</span>
          ))}

          {/* Account / Sign In (desktop) */}
          {!isMobile && (
            <span
              onClick={() => handleNav("Account")}
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: isLoggedIn ? "var(--red-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "color 0.2s",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--red-primary)"}
              onMouseLeave={e => e.currentTarget.style.color = isLoggedIn ? "var(--red-primary)" : "var(--text-secondary)"}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {accountLabel}
            </span>
          )}

          {/* Cart icon (always visible) */}
          <div role="button" tabIndex={0} aria-label="Shopping cart" onClick={() => { setMenuOpen(false); navigate("/cart"); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMenuOpen(false); navigate("/cart"); } }} style={{ position: "relative", display: "inline-flex", cursor: "pointer" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={location.pathname === "/cart" ? "var(--red-primary)" : "var(--text-secondary)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="20" r="1" />
              <circle cx="19" cy="20" r="1" />
              <path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6" />
            </svg>
            {cartCount > 0 && (
              <span style={{
                position: "absolute",
                top: -6,
                right: -8,
                background: "var(--red-primary)",
                color: "#fff",
                fontSize: 11,
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 700,
                borderRadius: "50%",
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>{cartCount}</span>
            )}
          </div>

          {/* Hamburger button (mobile only) */}
          {isMobile && (
            <div
              role="button"
              tabIndex={0}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(!menuOpen)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMenuOpen(!menuOpen); } }}
              style={{
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                padding: 4,
                marginLeft: 4,
              }}
            >
              <span style={{
                display: "block",
                width: 22,
                height: 2,
                background: menuOpen ? "var(--red-primary)" : "var(--text-secondary)",
                transition: "all 0.3s",
                transform: menuOpen ? "rotate(45deg) translate(3.5px, 3.5px)" : "none",
              }} />
              <span style={{
                display: "block",
                width: 22,
                height: 2,
                background: menuOpen ? "transparent" : "var(--text-secondary)",
                transition: "all 0.3s",
              }} />
              <span style={{
                display: "block",
                width: 22,
                height: 2,
                background: menuOpen ? "var(--red-primary)" : "var(--text-secondary)",
                transition: "all 0.3s",
                transform: menuOpen ? "rotate(-45deg) translate(3.5px, -3.5px)" : "none",
              }} />
            </div>
          )}
        </nav>
      </div>

      {/* Mobile dropdown menu */}
      {isMobile && menuOpen && (
        <div style={{
          background: "rgba(10,10,10,0.98)",
          borderTop: "1px solid rgba(196,30,42,0.15)",
          padding: "12px 0",
          animation: "fadeIn 0.2s ease-out",
        }}>
          {["Products", "Research", "Lab Results", "Calculator", "Contact", "Cart", accountLabel].map(item => (
            <div
              key={item}
              onClick={() => handleNav(item)}
              style={{
                padding: "14px 24px",
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: (item === accountLabel && isLoggedIn) ? "var(--red-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                transition: "all 0.2s",
              }}
            >{item}</div>
          ))}
        </div>
      )}
    </header>
  );
}

function Hero({ statsActive = true }) {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 700);
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section style={{
      position: "relative",
      paddingTop: isMobile ? 104 : 116,
      paddingBottom: isMobile ? 64 : 80,
      overflow: "hidden",
      textAlign: "center",
      minHeight: "clamp(380px, 55vh, 620px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {/* Background vial image with zoom + parallax */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url('/herobackground.jpg')`,
        // The prerender regression briefly narrowed the entire page to 960px,
        // which made this height-sized image look much fuller. Now that the
        // page is correctly full width, crop only the desktop hero instead of
        // shrinking the whole site around it. Top anchoring keeps the vial caps
        // visible while the image fills wide screens edge to edge.
        backgroundSize: isMobile ? "150% auto" : "cover",
        backgroundPosition: isMobile
          ? `center ${25 + scrollY * 0.012}%`
          : "center top",
        backgroundRepeat: "no-repeat",
        opacity: 0.62,
        pointerEvents: "none",
        transformOrigin: isMobile ? "center center" : "center top",
        animation: "heroZoom 24s ease-in-out infinite alternate",
      }} />

      {/* Dark overlay for text readability */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(9,10,12,0.36) 0%, rgba(9,10,12,0.7) 52%, rgba(9,10,12,0.97) 100%)",
        pointerEvents: "none",
      }} />

      {/* Red glow behind text — breathes */}
      <div style={{
        position: "absolute",
        top: "40%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 700,
        height: 500,
        background: "radial-gradient(ellipse, rgba(196,30,42,0.15) 0%, transparent 65%)",
        pointerEvents: "none",
        animation: "redGlowBreathe 6s ease-in-out infinite",
      }} />

      <div style={{
        position: "relative",
        zIndex: 1,
        animation: "fadeUp 1s ease-out",
        padding: "0 24px",
        maxWidth: 1400,
        margin: "0 auto",
        width: "100%",
        textAlign: "left",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 400,
          fontSize: 12,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 20,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          RESEARCH GRADE PEPTIDES
        </div>

        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 900,
          lineHeight: 1.0,
          marginBottom: 16,
          textTransform: "uppercase",
        }}>
          <span style={{
            display: "block",
            fontSize: "clamp(40px, 7vw, 80px)",
            color: "var(--text-primary)",
            letterSpacing: "0.04em",
          }}>TIER ONE</span>
          <span style={{
            display: "block",
            fontSize: "clamp(40px, 7vw, 80px)",
            color: "var(--red-primary)",
            letterSpacing: "0.04em",
          }}>BIOSYSTEMS</span>
        </h1>

        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: "clamp(20px, 3vw, 30px)",
          fontWeight: 500,
          fontStyle: "italic",
          color: "var(--text-secondary)",
          marginBottom: 24,
          letterSpacing: "0.02em",
        }}>Precision. Purity. Performance.</div>

        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 18,
          fontWeight: 500,
          color: "var(--text-secondary)",
          maxWidth: 560,
          lineHeight: 1.7,
          letterSpacing: "0.02em",
          marginBottom: 28,
          background: "rgba(9,10,12,0.76)",
          padding: "14px 18px",
          borderLeft: "2px solid var(--red-primary)",
        }}>
          Industry-leading research peptides synthesized to the highest standards.
          Every compound is independently verified — because precision is non-negotiable.
        </p>

        <div style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 36,
        }}>
          {["99%+ PURITY", "THIRD-PARTY TESTED", "RESEARCH USE ONLY", "FREE SHIPPING $200+"].map((badge, i) => (
            <span key={i} style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              padding: "8px 16px",
              border: "1px solid rgba(196,30,42,0.4)",
              background: "rgba(9,10,12,0.58)",
              color: "var(--red-primary)",
              animation: `fadeUp ${0.8 + i * 0.15}s ease-out`,
            }}>{badge}</span>
          ))}
        </div>

        <div style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}>
          <button onClick={() => navigate("/contact")} style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.15em",
            padding: "16px 36px",
            background: "var(--red-primary)",
            border: "none",
            color: "var(--text-primary)",
            cursor: "pointer",
            textTransform: "uppercase",
            transition: "all 0.2s",
          }}>CONTACT US</button>
          <button onClick={() => navigate("/lab-results")} style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.15em",
            padding: "16px 36px",
            background: "transparent",
            border: "1px solid var(--border-hover)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            textTransform: "uppercase",
            transition: "all 0.2s",
          }}>VIEW LAB RESULTS</button>
        </div>

        {/* Animated stats */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 24,
          marginTop: 56,
          maxWidth: 720,
        }}>
          {[
            { value: 99, suffix: "%+", label: "Purity Verified" },
            { value: 25, suffix: "+", label: "Compounds" },
            { value: 200, prefix: "$", suffix: "+", label: "Free Shipping" },
            { value: 24, suffix: "h", label: "Order Processing" },
          ].map((stat, i) => (
            <div key={i} style={{
              padding: "18px 16px",
              border: "1px solid rgba(217,54,66,0.28)",
              background: "rgba(9,10,12,0.72)",
              backdropFilter: "blur(8px)",
              textAlign: "center",
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 800,
                fontSize: 32,
                color: "var(--red-primary)",
                letterSpacing: "0.02em",
                marginBottom: 4,
              }}><CountUp end={stat.value} prefix={stat.prefix || ""} suffix={stat.suffix} duration={1800} start={statsActive} /></div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom line */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: "10%",
        right: "10%",
        height: 1,
        background: "linear-gradient(to right, transparent, rgba(196,30,42,0.2), transparent)",
      }} />
    </section>
  );
}

function ProductCard({ product, index, onClick, onAddToCart }) {
  const [hovered, setHovered] = useState(false);
  const href = `/product/${product.id}`;

  // The card opens a quick-view panel rather than navigating, which is why it
  // used to be a plain clickable <div>. That made every product page invisible
  // to crawlers (they follow href attributes, not click handlers) and
  // unreachable by keyboard.
  //
  // It is now a real link that happens to intercept ordinary left-clicks. A
  // crawler sees a normal <a href>; a keyboard user can Tab to it and press
  // Enter; cmd/ctrl/middle-click still open the product page in a new tab,
  // because those are left to the browser.
  const openQuickView = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onClick(product);
  };

  return (
    <div
      className="product-card"
      onClick={() => onClick(product)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered ? "var(--bg-card-hover)" : "var(--bg-card)",
        border: `1px solid ${hovered ? "rgba(196,30,42,0.3)" : "var(--border)"}`,
        cursor: "pointer",
        animation: `fadeUp ${0.4 + index * 0.05}s ease-out`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Scan line effect on hover */}
      {hovered && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "100%",
          background: "linear-gradient(to bottom, transparent 40%, rgba(196,30,42,0.03) 50%, transparent 60%)",
          animation: "scanLine 2s linear infinite",
          pointerEvents: "none",
          zIndex: 2,
        }} />
      )}

      {/* Image */}
      <div style={{
        position: "relative",
        paddingTop: "100%",
        overflow: "hidden",
        background: "#080808",
      }}>
        {/* aria-hidden + tabIndex -1: the title link below is the one that
            carries this card in the tab order, so the image does not add a
            second stop pointing at the same URL. */}
        <a
          href={href}
          onClick={openQuickView}
          tabIndex={-1}
          aria-hidden="true"
          className="product-card-inner"
          style={{ position: "absolute", inset: 0, display: "block" }}
        >
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </a>
      </div>

      {/* Info */}
      <div className="product-card-info" style={{ padding: "16px 18px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
        <a
          href={href}
          onClick={openQuickView}
          className="product-card-title"
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: "0.05em",
            marginBottom: 2,
            color: "inherit",
            textDecoration: "none",
            display: "block",
          }}
        >{product.name} <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{product.dose}</span></a>

        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 600,
          fontSize: 16,
          color: "var(--text-secondary)",
          marginBottom: 14,
        }}>{product.dose}</div>

        <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          {isSaleActive() ? (<>
            <span className="product-card-price" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 26, color: "var(--text-primary)" }}>${applySale(product.price)}</span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, color: "var(--text-dim)", textDecoration: "line-through" }}>${product.price}</span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--red-primary)", fontWeight: 700 }}>5+ @ ${applySale(product.bulk)}</span>
          </>) : (<>
            <span className="product-card-price" style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 26, color: "var(--text-primary)" }}>${product.price}</span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--red-primary)", fontWeight: 700 }}>5+ @ ${product.bulk}</span>
          </>)}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onAddToCart(product); }}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "9px 0",
            background: "transparent",
            border: "1px solid var(--red-primary)",
            color: "var(--red-primary)",
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
        >Add to Cart</button>
      </div>

      {/* Bottom accent line */}
      <div style={{
        height: 2,
        background: hovered
          ? "linear-gradient(to right, var(--red-primary), var(--red-dark), transparent)"
          : "linear-gradient(to right, rgba(196,30,42,0.15), transparent)",
        transition: "all 0.35s ease",
      }} />
    </div>
  );
}

function MolecularProfile({ product, compact }) {
  const profile = getMolecularProfile(product.name);
  if (!profile) return null;
  const isBlend = Array.isArray(profile.components);
  const sectionLabel = isBlend ? "Composition Profile" : "Molecular Profile";
  const rows = isBlend
    ? [
        { label: "Type", value: profile.type },
        ...profile.components.map(c => ({ label: c.name, value: `${c.dose} — ${c.role}` })),
        { label: "Total Content", value: profile.totalContent },
        { label: "Form", value: profile.form },
      ].filter(r => r.value)
    : [
        { label: "Type", value: profile.type },
        { label: "Amino acids", value: profile.aminoAcids },
        { label: "Molecular weight", value: profile.molecularWeight },
        { label: "CAS Number", value: profile.casNumber },
        { label: "Molecular formula", value: profile.molecularFormula },
        { label: "Modification", value: profile.modification },
      ].filter(r => r.value);

  if (compact) {
    return (
      <div style={{
        border: "1px solid var(--border)",
        background: "rgba(17,17,17,0.5)",
      }}>
        <div style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
        }}>{sectionLabel}</div>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: "grid",
            gridTemplateColumns: "minmax(100px, 32%) 1fr",
            alignItems: "baseline",
            gap: 12,
            padding: "9px 14px",
            borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--text-dim)",
              textTransform: "uppercase",
            }}>{row.label}</span>
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              wordBreak: "break-word",
              lineHeight: 1.4,
            }}>{row.value}</span>
          </div>
        ))}
        {profile.pubchemCID && (
          <a
            href={`https://pubchem.ncbi.nlm.nih.gov/compound/${profile.pubchemCID}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              padding: "9px 14px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--red-primary)",
              textDecoration: "none",
            }}
          >PubChem — CID {profile.pubchemCID}</a>
        )}
      </div>
    );
  }

  return (
    <div style={{
      border: "1px solid var(--border)",
      background: "var(--bg-card)",
      padding: "24px 28px",
    }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.18em",
        color: "var(--red-primary)",
        textTransform: "uppercase",
        marginBottom: 10,
      }}>{sectionLabel}</div>
      <h3 style={{
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: "0.02em",
        marginBottom: 18,
        color: "var(--text-primary)",
      }}>What is {product.name}?</h3>
      <div style={{
        border: "1px solid var(--border)",
        background: "rgba(17,17,17,0.5)",
      }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: "grid",
            gridTemplateColumns: "minmax(120px, 35%) 1fr",
            alignItems: "baseline",
            gap: 16,
            padding: "12px 18px",
            borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--red-primary)",
              textTransform: "uppercase",
            }}>{row.label}</span>
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              wordBreak: "break-word",
            }}>{row.value}</span>
          </div>
        ))}
      </div>
      {profile.pubchemCID && (
        <a
          href={`https://pubchem.ncbi.nlm.nih.gov/compound/${profile.pubchemCID}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 14,
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--red-primary)",
            textDecoration: "none",
          }}
        >PubChem — CID {profile.pubchemCID}</a>
      )}
    </div>
  );
}

// References we are willing to show under a "peer-reviewed research" heading.
// Wikipedia entries stay in the underlying data as background reading but are
// never rendered as a citation.
const NON_CITABLE_SOURCES = new Set(["WIKIPEDIA"]);
function citableReferences(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.filter(ref => !NON_CITABLE_SOURCES.has((ref?.journal || "").toUpperCase()));
}

function SourcesReferences({ product }) {
  // Wikipedia is fine as background reading and useless as a citation under a
  // heading that says "peer-reviewed research". It stays in the source data —
  // it is genuinely where some of this was checked — but it is not presented
  // to customers as evidence.
  const refs = citableReferences(getReferences(product.name));
  if (!refs || refs.length === 0) return null;
  const isMobile = window.innerWidth < 700;
  const profile = getMolecularProfile(product.name);
  const isBlend = Array.isArray(profile?.components);
  return (
    <div>
      <div style={{ marginBottom: isBlend ? 12 : 18 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 6,
        }}>{isBlend ? "Research on individual components" : "Peer-reviewed research"}</div>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.02em",
          color: "var(--text-primary)",
        }}>Sources &amp; References</div>
      </div>
      {isBlend && (
        <div style={{
          padding: "10px 14px",
          marginBottom: 16,
          border: "1px solid rgba(196,30,42,0.15)",
          background: "rgba(196,30,42,0.04)",
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 14,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}>No published clinical research exists on this specific blend formulation. Citations below reference the individual component compounds.</div>
      )}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
      }}>
        {refs.map((ref, i) => (
          <a
            key={i}
            href={ref.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              padding: "16px 18px",
              border: "1px solid var(--border)",
              background: "rgba(17,17,17,0.5)",
              textDecoration: "none",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(196,30,42,0.4)"; e.currentTarget.style.background = "rgba(196,30,42,0.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(17,17,17,0.5)"; }}
          >
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--red-primary)",
              marginBottom: 8,
              textTransform: "uppercase",
            }}>{ref.journal}</div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.35,
              marginBottom: 8,
            }}>{ref.title}</div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 13,
              color: "var(--text-dim)",
              marginBottom: ref.authors ? 6 : 10,
            }}>{ref.year ? `${ref.year} · ` : ""}{ref.identifier}</div>
            {ref.authors && (
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 13,
                fontStyle: "italic",
                color: "var(--text-secondary)",
                marginBottom: 10,
              }}>{ref.authors}</div>
            )}
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--red-primary)",
            }}>View Source ↗</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function ProductQuickView({ product, onClose, onAddToCart, onViewDetails }) {
  const overlayRef = useRef(null);
  const isMobile = window.innerWidth < 700;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={e => e.target === overlayRef.current && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? 12 : 20,
        animation: "fadeIn 0.25s ease-out",
      }}
    >
      <div style={{
        position: "relative",
        background: "var(--bg-modal)",
        border: "1px solid rgba(196,30,42,0.2)",
        maxWidth: 800,
        width: "100%",
        maxHeight: "90vh",
        overflow: "auto",
        animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Close button */}
        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 10,
            width: 32,
            height: 32,
            border: "1px solid var(--border)",
            background: "rgba(10,10,10,0.9)",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 18,
            fontWeight: 300,
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.target.style.borderColor = "var(--red-primary)"; e.target.style.color = "var(--red-primary)"; }}
          onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
        >✕</button>

        {/* Image */}
        <div style={{
          // The catalog photos use a nearly-black studio backdrop. Matching
          // that tone here and seating the image directly on the lower edge
          // prevents the square JPEG boundary from showing around the vial or
          // cutting across its reflection.
          background: "#010403",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          overflow: "hidden",
          height: isMobile ? 280 : 360,
        }}>
          <img src={product.image} alt={product.name} style={{ display: "block", width: "auto", height: "100%", maxWidth: "100%", objectFit: "contain" }} />
        </div>

        {/* Info */}
        <div style={{ padding: "20px 24px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile || !getMolecularProfile(product.name) ? "1fr" : "1fr 1fr",
            gap: 20,
            marginBottom: 16,
          }}>
            {/* Left column: name, price, purity */}
            <div>
              <h2 style={{
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: "0.03em",
                lineHeight: 1.1,
                marginBottom: 4,
              }}>{product.name}</h2>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 16,
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}>{product.dose}</div>

              {/* Price */}
              {isSaleActive() ? (<>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 24, color: "var(--text-primary)" }}>${applySale(product.price)}</span>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--text-secondary)" }}>/vial</span>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, color: "var(--text-dim)", textDecoration: "line-through" }}>${product.price}</span>
                </div>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.15em", color: "var(--red-primary)", fontWeight: 700, marginBottom: 6 }}>SAVE {SITEWIDE_SALE.percentOff}%</div>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--red-primary)", fontWeight: 700, marginBottom: 16 }}>5+ Vials: ${applySale(product.bulk)} each <span style={{ color: "var(--text-dim)", fontWeight: 400, textDecoration: "line-through", fontSize: 14, marginLeft: 6 }}>${product.bulk}</span></div>
              </>) : (<>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 24 }}>${product.price}</span>
                  <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--text-secondary)" }}>/vial</span>
                </div>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--red-primary)", fontWeight: 700, marginBottom: 16 }}>5+ Vials: ${product.bulk} each</div>
              </>)}

              {/* Purity + Form */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[{ label: "PURITY", value: product.purity }, { label: "FORM", value: "Lyophilized" }].map((s, i) => (
                  <div key={i} style={{ padding: "8px 12px", border: "1px solid var(--border)" }}>
                    <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-dim)", marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column: molecular profile */}
            {getMolecularProfile(product.name) && (
              <div>
                <MolecularProfile product={product} compact />
              </div>
            )}
          </div>

          {/* Buttons */}
          <button onClick={() => onAddToCart(product)} style={{
            width: "100%",
            padding: "12px 0",
            background: "var(--red-primary)",
            border: "1px solid var(--red-primary)",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
            marginBottom: 10,
          }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >ADD TO CART</button>

          <button onClick={() => { onClose(); onViewDetails(product); }} style={{
            width: "100%",
            padding: "12px 0",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.target.style.borderColor = "var(--red-primary)"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
          >VIEW FULL DETAILS</button>
        </div>
      </div>
    </div>
  );
}

const FOOTER_LINK_STYLE = {
  fontFamily: "'Rajdhani', sans-serif",
  fontSize: 13,
  color: "var(--text-secondary)",
  cursor: "pointer",
  textDecoration: "none",
  transition: "color 0.2s",
  display: "block",
  padding: "4px 0",
};
function FooterLink({ to, children }) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      onClick={(e) => { e.preventDefault(); navigate(to); }}
      style={FOOTER_LINK_STYLE}
      onMouseEnter={e => e.target.style.color = "var(--red-primary)"}
      onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}
    >{children}</a>
  );
}

function Footer() {
  const headingStyle = {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.15em",
    color: "var(--red-primary)",
    textTransform: "uppercase",
    marginBottom: 14,
  };
  return (
    <footer style={{
      borderTop: "1px solid var(--border)",
      paddingTop: 60,
    }}>
      <div className="footer-grid" style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "0 24px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 40,
        marginBottom: 40,
      }}>
        <div className="footer-brand">
          <div style={headingStyle}>Tier One Bio</div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}>
            Research-grade peptides with 99%+ purity. Lot-tested and US-based.
          </div>
        </div>

        <div>
          <div style={headingStyle}>Shop</div>
          <FooterLink to="/products">All Products</FooterLink>
          <FooterLink to="/research">Research</FooterLink>
          <FooterLink to="/lab-results">Lab Results</FooterLink>
          <FooterLink to="/calculator">Reconstitution Calculator</FooterLink>
        </div>

        <div>
          <div style={headingStyle}>Info</div>
          <FooterLink to="/about">About</FooterLink>
          <FooterLink to="/faq">FAQ</FooterLink>
          <FooterLink to="/testing-standards">Testing Standards</FooterLink>
          <FooterLink to="/contact">Contact</FooterLink>
        </div>

        <div>
          <div style={headingStyle}>Policies</div>
          <FooterLink to="/shipping">Shipping</FooterLink>
          <FooterLink to="/returns">Returns</FooterLink>
          <FooterLink to="/terms">Terms of Service</FooterLink>
          <FooterLink to="/privacy">Privacy Policy</FooterLink>
        </div>
      </div>

      <div style={{
        borderTop: "1px solid var(--border)",
        padding: "28px 24px",
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: "0.15em",
          marginBottom: 6,
        }}>TIER ONE BIOSYSTEMS</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 12,
          color: "var(--text-dim)",
          marginBottom: 16,
          lineHeight: 1.6,
        }}>
          All products are sold for research and laboratory use only.
          <br />Not for human consumption. Not a drug, food, or cosmetic.
        </div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 12,
          color: "var(--text-secondary)",
          letterSpacing: "0.05em",
        }}>© 2026 Tier One BioSystems. All rights reserved.</div>
      </div>
    </footer>
  );
}

// ─── Syringe Diagram ─────────────────────────────────────────────────────────

// SyringeDiagram was removed with the calculator's reframing. A rendered
// insulin syringe reads as a dosing instruction whatever the caption says,
// and the microlitre figure already gives a laboratory the volume it needs.

// ─── Peptide Calculator ───────────────────────────────────────────────────────

function PeptideCalculator() {
  useRouteMeta("/calculator");
  const [vialMg, setVialMg] = useState("");
  const [waterMl, setWaterMl] = useState("");
  const [doseValue, setDoseValue] = useState("");
  const [doseUnit, setDoseUnit] = useState("mcg");

  const doseMcg = doseValue ? (doseUnit === "mg" ? parseFloat(doseValue) * 1000 : parseFloat(doseValue)) : null;
  function fmt(n) {
    if (!n) return "—";
    const one = parseFloat(n.toFixed(1));
    return one > 0 ? n.toFixed(1) : parseFloat(n.toPrecision(2)).toString();
  }

  const concentration = vialMg && waterMl ? parseFloat(vialMg) / parseFloat(waterMl) : null;
  const volumeMl = concentration && doseMcg ? (doseMcg / 1000) / concentration : null;

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(17,17,17,0.8)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 16,
    fontWeight: 500,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>Research Tools</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 5vw, 42px)",
          color: "var(--text-primary)",
          letterSpacing: "0.03em",
          marginBottom: 16,
          textTransform: "uppercase",
        }}>Laboratory Concentration<br />Calculator</h2>
        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          color: "var(--text-secondary)",
          maxWidth: 520,
          margin: "0 auto",
          lineHeight: 1.7,
        }}>Enter the vial content, the diluent volume, and the mass required per aliquot to obtain the resulting concentration and the volume to withdraw.</p>
      </div>

      {/* Inputs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 24,
        marginBottom: 40,
      }}>
        <div>
          <label style={labelStyle}>Vial Content (mg)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 5"
            value={vialMg}
            onChange={e => setVialMg(e.target.value)}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
        <div>
          <label style={labelStyle}>Diluent Volume (mL)</label>
          <input
            type="number"
            min="0"
            placeholder="e.g. 2"
            value={waterMl}
            onChange={e => setWaterMl(e.target.value)}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
        <div>
          <label style={labelStyle}>Target Aliquot</label>
          <div style={{ display: "flex", gap: 0 }}>
            <input
              type="number"
              min="0"
              placeholder={doseUnit === "mcg" ? "e.g. 250" : "e.g. 0.25"}
              value={doseValue}
              onChange={e => setDoseValue(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
              onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
            {["mcg", "mg"].map(unit => (
              <button
                key={unit}
                onClick={() => setDoseUnit(unit)}
                style={{
                  padding: "0 16px",
                  background: doseUnit === unit ? "var(--red-primary)" : "rgba(17,17,17,0.8)",
                  border: "1px solid var(--border)",
                  borderLeft: "none",
                  color: doseUnit === unit ? "#fff" : "var(--text-secondary)",
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                  transition: "all 0.2s",
                }}
              >{unit}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{
        border: "1px solid rgba(196,30,42,0.3)",
        background: "rgba(17,17,17,0.6)",
        padding: "32px",
        marginBottom: 16,
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 24,
        }}>Results</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 24 }}>
          {[
            {
              label: "Concentration",
              value: concentration ? `${fmt(concentration)} mg/mL` : "—",
              sub: "after reconstitution",
            },
            {
              label: "Aliquot Volume",
              value: volumeMl ? `${fmt(volumeMl * 1000)} µL` : "—",
              sub: "to withdraw per aliquot",
            },
          ].map((r, i) => (
            <div key={i} style={{
              borderLeft: "2px solid rgba(196,30,42,0.4)",
              paddingLeft: 16,
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 13,
                letterSpacing: "0.1em",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                marginBottom: 8,
              }}>{r.label}</div>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 26,
                fontWeight: 700,
                color: concentration ? "var(--text-primary)" : "var(--text-secondary)",
                marginBottom: 4,
              }}>{r.value}</div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 16,
                color: "var(--text-secondary)",
              }}>{r.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* The syringe graduation diagram was removed rather than relabelled. A
          picture of a filled insulin syringe reads as a dosing instruction no
          matter what the caption says, and the µL figure above already gives
          the volume a laboratory needs. */}

      {/* How it works */}
      <div style={{
        border: "1px solid var(--border)",
        background: "rgba(17,17,17,0.4)",
        padding: "28px 32px",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>How to Use</div>
        <ol style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 18,
          color: "var(--text-secondary)",
          lineHeight: 2,
          paddingLeft: 20,
          margin: 0,
        }}>
          <li>Enter the labeled material quantity in milligrams.</li>
          <li>Enter the total laboratory diluent volume in millilitres.</li>
          <li>Enter the target aliquot in micrograms or milligrams.</li>
          <li>Dispense diluent down the inside wall of the vial and swirl gently until dissolved — do not shake.</li>
          <li>Use the calculated concentration and microlitre volume in accordance with your validated laboratory protocol.</li>
          <li>Verify all calculations independently and follow the stability documentation for the specific lot.</li>
        </ol>
      </div>

      <div style={{
        marginTop: 24,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        color: "var(--text-secondary)",
        textAlign: "center",
        lineHeight: 1.6,
        opacity: 0.7,
      }}>For in-vitro laboratory research only. This tool does not provide human or veterinary dosing instructions. Always verify calculations independently.</div>
    </div>
  );
}

// ─── Contact Page ────────────────────────────────────────────────────────────

function ContactPage() {
  useRouteMeta("/contact");
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(17,17,17,0.8)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };

  function handleSubmit(e) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    const formData = new URLSearchParams();
    formData.append("form-name", "contact");
    formData.append("bot-field", "");
    formData.append("name", form.name);
    formData.append("email", form.email);
    formData.append("subject", form.subject);
    formData.append("message", form.message);
    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }).then((res) => {
      if (res.ok) setSubmitted(true);
      else console.error("Form submission failed:", res.status);
    }).catch((err) => console.error("Form error:", err)).finally(() => setSending(false));
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>Get In Touch</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 5vw, 42px)",
          color: "var(--text-primary)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}>Contact Us</h2>
        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
        }}>Questions about our products, orders, or research support? We'll get back to you within 24 hours.</p>
      </div>

      {submitted ? (
        <div style={{
          border: "1px solid rgba(196,30,42,0.4)",
          background: "rgba(17,17,17,0.6)",
          padding: "48px 32px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: 12,
          }}>Message Sent</div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 17,
            color: "var(--text-secondary)",
          }}>We'll be in touch within 24 hours.</div>
        </div>
      ) : (
        <form name="contact" method="POST" data-netlify="true" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <input type="hidden" name="form-name" value="contact" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input required type="text" placeholder="Your name" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input required type="email" placeholder="your@email.com" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Subject</label>
            <input type="text" placeholder="Order inquiry, product question..." value={form.subject}
              onChange={e => setForm({ ...form, subject: e.target.value })}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"} />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea required placeholder="How can we help?" value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              rows={6}
              style={{ ...inputStyle, resize: "vertical" }}
              onFocus={e => e.target.style.borderColor = "var(--red-primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"} />
          </div>
          <button type="submit" disabled={sending} style={{
            padding: "14px 0",
            background: "var(--red-primary)",
            border: "1px solid var(--red-primary)",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            cursor: sending ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            opacity: sending ? 0.6 : 1,
          }}
            onMouseEnter={e => { if (!sending) { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; } }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >{sending ? "Sending…" : "Send Message"}</button>
        </form>
      )}
    </div>
  );
}

// ─── Cart Page ────────────────────────────────────────────────────────────────

// Discount codes are validated server-side via a Netlify Function that reads
// them from environment variables. Codes are never included in the client
// bundle. See netlify/functions/validate-discount.js.

function CartPage({ cart, setCart }) {
  useRouteMeta("/cart");
  const navigate = useNavigate();
  const { user, profile, isLoggedIn } = useAuth();
  const [step, setStep] = useState("cart"); // cart, info, payment, confirmed
  const [guestMode, setGuestMode] = useState(false); // customer chose to skip creating an account
  const [customerInfo, setCustomerInfo] = useState({
    name: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
  });

  // Prefill shipping details from the signed-in customer's saved profile.
  useEffect(() => {
    if (!profile) return;
    setCustomerInfo(prev => ({
      name: prev.name || profile.full_name || "",
      email: prev.email || profile.email || user?.email || "",
      phone: prev.phone || profile.phone || "",
      address: prev.address || profile.address || "",
      city: prev.city || profile.city || "",
      state: prev.state || profile.state || "",
      zip: prev.zip || profile.zip || "",
    }));
  }, [profile, user]);
  const [orderNumber, setOrderNumber] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [paymentMethod, setPaymentMethod] = useState("cashapp"); // cashapp | venmo
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null); // { code, type, value, label } — order discount slot
  const [appliedShipping, setAppliedShipping] = useState(null); // { code, type, value, label } — free-shipping slot
  const [discountError, setDiscountError] = useState("");
  const [discountLoading, setDiscountLoading] = useState(false);
  const [paymentInitiated, setPaymentInitiated] = useState(false);
  const [returnedFromPayment, setReturnedFromPayment] = useState(false);
  const [researchAcknowledged, setResearchAcknowledged] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderSubmitError, setOrderSubmitError] = useState("");
  const [receiptSent, setReceiptSent] = useState(true);
  // Which durable writes have already landed for this order number. Confirming
  // twice — a double click, or a retry after a partial failure — must not
  // create a second order row or a second notification.
  const submissionRef = useRef({ orderNumber: null, supabase: false, netlify: false, discount: false });
  // Re-entry guard. This has to be a ref, not the orderSubmitting state: React
  // batches state updates, so on a fast double-click both handlers would read
  // orderSubmitting as false and both would insert an order. A ref flips
  // synchronously, before the second click can get past it.
  const submittingRef = useRef(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  function updateQty(id, delta) {
    setCart(prev => prev
      .map(item => item.id === id ? { ...item, qty: clampQuantity(item.qty + delta) } : item)
      .filter(item => item.qty > 0)
    );
  }

  // Tiered bulk pricing lives in src/data/order-totals.js — one definition
  // shared by this page, the cart popup and the server-side order function.
  const getItemPrice = lineUnitPrice;

  // The figures shown here come from the same function create-order uses to
  // price the order, so what the customer is quoted is what the server records.
  // If these ever disagreed, the customer would be shown one total and charged
  // another.
  const { subtotal, discountAmount, subtotalAfterDiscount, shipping, total } = orderTotals(cart, {
    discount: appliedDiscount,
    freeShipping: !!appliedShipping,
  });

  // Codes that unlock the free-shipping slot instead of the regular discount slot
  // Shared with the server so a code is classified the same way in both places.
  const isShippingDiscount = isShippingDiscountCode;

  async function applyDiscountCode() {
    if (isSaleActive()) {
      setDiscountError(`Discount codes are disabled during the ${SITEWIDE_SALE.headline.toLowerCase().replace(" sitewide", "")}.`);
      return;
    }
    const code = discountInput.trim().toUpperCase();
    if (!code) {
      setDiscountError("Enter a discount code.");
      return;
    }
    if ((appliedDiscount && appliedDiscount.code === code) || (appliedShipping && appliedShipping.code === code)) {
      setDiscountError("That code is already applied.");
      return;
    }
    setDiscountLoading(true);
    setDiscountError("");
    try {
      // Send the access token when signed in. Per-customer single-use codes
      // (the welcome code) are bound to a user_id, so the function can only
      // match one if it knows who is asking. Guests just get the sitewide list.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const res = await fetch("/.netlify/functions/validate-discount", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({ valid: false, error: "Could not reach discount service." }));
      if (!res.ok || !data.valid) {
        setDiscountError(data.error || "Invalid discount code.");
        return;
      }
      const appliedCode = {
        code: data.code,
        type: data.type,
        value: data.value,
        label: data.label,
      };
      if (isShippingDiscount(data.code)) {
        if (appliedShipping) {
          setDiscountError("A free-shipping code is already applied.");
          return;
        }
        setAppliedShipping(appliedCode);
      } else {
        if (appliedDiscount) {
          setDiscountError("A discount code is already applied. Remove it before adding another.");
          return;
        }
        setAppliedDiscount(appliedCode);
      }
      setDiscountInput("");
      setDiscountError("");
    } catch (err) {
      console.error("Discount validation error:", err);
      setDiscountError("Could not reach discount service. Try again.");
    } finally {
      setDiscountLoading(false);
    }
  }

  function removeDiscountCode() {
    setAppliedDiscount(null);
    setDiscountError("");
  }
  function removeShippingCode() {
    setAppliedShipping(null);
    setDiscountError("");
  }

  function generateOrderNumber() {
    const date = new Date();
    const y = date.getFullYear().toString().slice(-2);
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    // 6 crypto-random digits rather than 4 from Math.random(): with only 9,000
    // possible values a same-day collision became likely at modest volume,
    // which would mean two different orders sharing one reference number.
    let rand;
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      rand = 100000 + (buf[0] % 900000);
    } else {
      rand = Math.floor(100000 + Math.random() * 900000);
    }
    return `T1B-${y}${m}${d}-${rand}`;
  }

  function handleCheckout() {
    // Validate fields
    const { name, email, phone, address, city, state, zip } = customerInfo;
    if (!name || !email || !phone || !address || !city || !state || !zip) return;

    const num = generateOrderNumber();
    setOrderNumber(num);
    setStep("payment");
  }

  // Fires when the user clicks "Open Cash App" / "Open Venmo".
  // Sends a "PENDING_PAYMENT" notification so the owner sees the order
  // attempt even if the customer never returns to click confirm.
  function handlePaymentInitiated(method) {
    if (paymentInitiated) return; // one-shot per checkout
    setPaymentInitiated(true);
    const { name, email, phone, address, city, state, zip } = customerInfo;
    const itemsText = cart.map(item => {
      const unitPrice = getItemPrice(item);
      const isBulk = item.qty >= 5;
      return `${item.name} ${item.dose} x${item.qty} @ $${unitPrice.toFixed(2)}${isBulk ? " (bulk)" : ""} = $${(unitPrice * item.qty).toFixed(2)}`;
    }).join("\n");
    const formData = new URLSearchParams();
    formData.append("form-name", "order");
    formData.append("bot-field", "");
    formData.append("orderStatus", "PENDING_PAYMENT");
    formData.append("orderNumber", orderNumber);
    formData.append("customerName", name);
    formData.append("customerEmail", email);
    formData.append("customerPhone", phone);
    formData.append("shippingAddress", address);
    formData.append("shippingCity", city);
    formData.append("shippingState", state);
    formData.append("shippingZip", zip);
    formData.append("orderItems", itemsText);
    formData.append("orderSubtotal", `$${subtotal.toFixed(2)}`);
    formData.append("discountCode", [appliedDiscount?.code, appliedShipping?.code].filter(Boolean).join(", "));
    formData.append("discountAmount", appliedDiscount ? `-$${discountAmount.toFixed(2)}` : "");
    formData.append("shipping", shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`);
    formData.append("paymentMethod", method);
    formData.append("orderTotal", `$${total.toFixed(2)}`);
    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }).catch((err) => console.error("Pending payment notification error:", err));
  }

  // Watch for the customer returning to the tab after going to Cash App / Venmo.
  // Trigger the "welcome back, please confirm" UI (banner + auto-scroll + pulse).
  useEffect(() => {
    if (step !== "payment" || !paymentInitiated) return;
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        setReturnedFromPayment(true);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    const originalTitle = document.title;
    document.title = "← Confirm payment · Tier One BioSystems";
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.title = originalTitle;
    };
  }, [step, paymentInitiated]);

  // When the return-banner appears, scroll to the confirm button so it's right under the customer's thumb.
  useEffect(() => {
    if (!returnedFromPayment) return;
    const btn = document.getElementById("confirm-payment-btn");
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [returnedFromPayment]);

  // Confirming payment must not report success unless the order actually
  // reached somewhere durable. The previous version fired the Supabase insert,
  // the Netlify Forms post and the EmailJS send without awaiting any of them,
  // then cleared the cart unconditionally — so a customer on a flaky connection
  // saw "order received", lost their cart, and left no record behind.
  //
  // The order of operations now is: save durably, and only then do the things
  // that can be redone by hand (redeem the code, send the receipt). The cart is
  // the customer's only copy of the order, so it is cleared last of all.
  async function handlePaymentConfirmed() {
    if (submittingRef.current) return;
    if (!orderNumber || cart.length === 0) {
      setOrderSubmitError("Your order details are incomplete. Go back to the cart and try again.");
      return;
    }
    submittingRef.current = true;
    setOrderSubmitting(true);
    setOrderSubmitError("");

    // Reset the idempotency record if this is a different order number.
    if (submissionRef.current.orderNumber !== orderNumber) {
      submissionRef.current = { orderNumber, supabase: false, netlify: false, discount: false };
    }
    const submission = submissionRef.current;

    const { name, email, phone, address, city, state, zip } = customerInfo;

    // Build order items text
    const discountCodes = [appliedDiscount?.code, appliedShipping?.code].filter(Boolean);

    // Submit to Netlify Forms
    const formData = new URLSearchParams();
    formData.append("form-name", "order");
    formData.append("bot-field", "");
    formData.append("orderStatus", "AWAITING PAYMENT");
    formData.append("orderNumber", orderNumber);
    formData.append("customerName", name);
    formData.append("customerEmail", email);
    formData.append("customerPhone", phone);
    formData.append("shippingAddress", address);
    formData.append("shippingCity", city);
    formData.append("shippingState", state);
    formData.append("shippingZip", zip);
    formData.append("paymentMethod", paymentMethod === "venmo" ? "Venmo" : "Cash App");
    // Recorded so there is evidence the acknowledgement was given for this order.
    formData.append("researchUseAcknowledged", researchAcknowledged ? "yes" : "no");
    // The money fields are appended after the server has priced the order, so
    // that the notification the owner fulfils from carries the server's figures
    // rather than the browser's.

    // ── The order is created and priced by the server. ────────────────────
    // Only product ids and quantities are sent: every figure below comes back
    // from create-order, which recomputes them from the catalog. The function
    // writes through a UNIQUE constraint on order_number, so pressing Confirm
    // again — or after a refresh, which the old in-memory guard could not
    // survive — returns the original order rather than creating a second one.
    let confirmed;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch("/.netlify/functions/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          orderNumber,
          items: cart.map(item => ({ id: item.id, qty: item.qty })),
          customer: { name, email, phone, address, city, state, zip },
          paymentMethod,
          discountCodes,
          researchAcknowledged,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || `order service: HTTP ${res.status}`);
      }
      confirmed = payload;
      submission.supabase = true;
    } catch (err) {
      console.error("Order save error:", err);
      setOrderSubmitError(
        (err?.message && !/HTTP \d+/.test(err.message) ? `${err.message} ` : "") +
        `We could not confirm your order, so we have not cleared your cart. Nothing has been lost — ` +
        `press Confirm again to retry. If it keeps failing, email ${CONTACT_EMAIL} quoting ${orderNumber} ` +
        `and we will finish it by hand.`
      );
      submittingRef.current = false;
      setOrderSubmitting(false);
      return;
    }

    // The order now exists with these figures. Everything downstream quotes
    // the server's numbers, not the browser's.
    const itemsText = confirmed.itemsText;
    const serverTotals = confirmed.totals;

    formData.append("orderItems", itemsText);
    formData.append("orderSubtotal", `$${serverTotals.subtotal.toFixed(2)}`);
    formData.append("discountCode", discountCodes.join(", "));
    formData.append("discountAmount", serverTotals.discountAmount > 0 ? `-$${serverTotals.discountAmount.toFixed(2)}` : "");
    formData.append("shipping", serverTotals.shipping === 0 ? "FREE" : `$${serverTotals.shipping.toFixed(2)}`);
    formData.append("orderTotal", `$${serverTotals.total.toFixed(2)}`);

    // Notifies the owner for fulfilment. The order is already saved, so a
    // failure here is reported without discarding it.
    if (!submission.netlify) {
      try {
        const res = await fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });
        submission.netlify = res.ok;
        if (!res.ok) console.error("Order notification failed:", res.status);
      } catch (err) {
        console.error("Order notification error:", err);
      }
    }

    // ── Past this point the order exists. Everything below can be redone by
    //    hand, so a failure is reported but never discards a saved order. ────

    // Burn a single-use code so it can't be applied to a second order.
    // Sitewide codes aren't tracked and are a harmless no-op server-side.
    if (user && appliedDiscount?.code && !submission.discount) {
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data?.session?.access_token;
        if (accessToken) {
          const res = await fetch("/.netlify/functions/redeem-discount", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ code: appliedDiscount.code, orderNumber }),
          });
          submission.discount = res.ok;
        }
      } catch (err) {
        console.error("Discount redemption error:", err);
      }
    }

    // Send confirmation email to customer via EmailJS. If this fails the
    // confirmation screen says so, instead of promising an email that is
    // never going to arrive.
    try {
      await emailjs.send("service_r3r7crs", "template_i9k8u2a", {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        orderNumber: orderNumber,
        orderItems: itemsText,
        orderSubtotal: `$${subtotal.toFixed(2)}`,
        discountCode: [appliedDiscount?.code, appliedShipping?.code].filter(Boolean).join(", "),
        discountAmount: appliedDiscount ? `-$${discountAmount.toFixed(2)}` : "",
        shipping: shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`,
        paymentMethod: paymentMethod === "venmo" ? "Venmo" : "Cash App",
        orderTotal: `$${total.toFixed(2)}`,
        shippingAddress: address,
        shippingCity: city,
        shippingState: state,
        shippingZip: zip,
      }, "E2QQt-tqFcuyhtZOD");
      setReceiptSent(true);
    } catch (err) {
      console.error("Email error:", err);
      setReceiptSent(false);
    }

    submittingRef.current = false;
    setOrderSubmitting(false);
    setStep("confirmed");
    setCart([]);
  }

  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(17,17,17,0.8)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 16,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "block",
  };

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 120px 80px" : "1fr auto auto",
    alignItems: "center",
    gap: isMobile ? 12 : 24,
    padding: "20px 0",
    borderBottom: "1px solid var(--border)",
  };

  // ─── Order Confirmed Screen ──────────────────────────
  if (step === "confirmed") {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "120px 24px 80px", textAlign: "center" }}>
        <div style={{
          border: "1px solid rgba(34,197,94,0.3)",
          background: "rgba(34,197,94,0.03)",
          padding: "48px 32px",
          marginBottom: 24,
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#22c55e",
            marginBottom: 16,
          }}>ORDER SUBMITTED</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            color: "var(--text-primary)",
            marginBottom: 12,
          }}>THANK YOU!</h2>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 17,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            marginBottom: 24,
          }}>
            Your order has been received. Please allow up to 24 hours for payment confirmation
            and order processing.
          </p>
          <div style={{
            padding: "16px 24px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            display: "inline-block",
            marginBottom: 24,
          }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--text-dim)",
              marginBottom: 4,
            }}>ORDER NUMBER</div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 22,
              fontWeight: 800,
              color: "var(--red-primary)",
              letterSpacing: "0.05em",
            }}>{orderNumber}</div>
          </div>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 15,
            color: "var(--text-dim)",
            lineHeight: 1.6,
          }}>
            {receiptSent
              ? "Save your order number for reference. A confirmation has been sent to your email."
              : `Save your order number for reference. Your order is recorded, but we could not send the confirmation email — quote this number to ${CONTACT_EMAIL} if you would like a copy.`}
          </p>
        </div>
        <button onClick={() => { setStep("cart"); navigate("/"); }} style={{
          padding: "14px 36px",
          background: "var(--red-primary)",
          border: "1px solid var(--red-primary)",
          color: "#fff",
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "all 0.2s",
        }}>Continue Shopping</button>
      </div>
    );
  }

  // ─── Payment Screen ──────────────────────────────────
  if (step === "payment") {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--red-primary)",
            marginBottom: 10,
          }}>STEP 3 OF 3</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            color: "var(--text-primary)",
          }}>SEND PAYMENT</h2>
        </div>

        <div style={{
          border: "1px solid var(--border)",
          background: "rgba(17,17,17,0.4)",
          padding: "32px",
          marginBottom: 24,
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "var(--red-primary)",
            marginBottom: 16,
          }}>ORDER SUMMARY</div>
          <div style={{
            padding: "12px 16px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)" }}>ORDER NUMBER</span>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--red-primary)" }}>{orderNumber}</span>
          </div>
          {appliedDiscount && (
            <>
              <div style={{
                padding: "12px 16px",
                border: "1px solid var(--border)",
                background: "rgba(17,17,17,0.5)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)" }}>SUBTOTAL</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: "var(--text-secondary)" }}>${subtotal.toFixed(2)}</span>
              </div>
              <div style={{
                padding: "12px 16px",
                border: "1px solid var(--border)",
                background: "rgba(17,17,17,0.5)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "#22c55e" }}>DISCOUNT ({appliedDiscount.code})</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: "#22c55e" }}>−${discountAmount.toFixed(2)}</span>
              </div>
            </>
          )}
          <div style={{
            padding: "12px 16px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)" }}>SHIPPING</span>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: shipping === 0 ? "#22c55e" : "var(--text-secondary)" }}>
              {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
            </span>
          </div>
          <div style={{
            padding: "12px 16px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)" }}>TOTAL DUE</span>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>${total.toFixed(2)}</span>
          </div>
        </div>

        <div style={{
          border: "1px solid rgba(34,197,94,0.3)",
          background: "rgba(34,197,94,0.03)",
          padding: "32px",
          marginBottom: 24,
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#22c55e",
            marginBottom: 20,
          }}>PAYMENT INSTRUCTIONS</div>

          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 16,
            color: "var(--text-secondary)",
            lineHeight: 1.8,
            marginBottom: 24,
          }}>
            <p style={{ margin: "0 0 16px", fontWeight: 600, color: "var(--text-primary)", fontSize: 17 }}>Step 1: Copy your order number</p>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              border: "1px solid var(--border)",
              background: "rgba(17,17,17,0.5)",
              marginBottom: 20,
            }}>
              <span style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--red-primary)",
                letterSpacing: "0.05em",
              }}>{orderNumber}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(orderNumber);
                  const btn = document.getElementById("copy-btn");
                  if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy"; }, 2000); }
                }}
                id="copy-btn"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(34,197,94,0.3)",
                  color: "#22c55e",
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  padding: "6px 14px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(34,197,94,0.1)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </button>
            </div>

            <p style={{ margin: "0 0 12px", fontWeight: 600, color: "var(--text-primary)", fontSize: 17 }}>Step 2: Choose payment method</p>

            {/* Payment method tabs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setPaymentMethod("cashapp")}
                style={{
                  padding: "12px 0",
                  background: paymentMethod === "cashapp" ? "rgba(0,214,50,0.1)" : "transparent",
                  border: paymentMethod === "cashapp" ? "1px solid #00D632" : "1px solid var(--border)",
                  color: paymentMethod === "cashapp" ? "#00D632" : "var(--text-secondary)",
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >Cash App</button>
              <button
                onClick={() => setPaymentMethod("venmo")}
                style={{
                  padding: "12px 0",
                  background: paymentMethod === "venmo" ? "rgba(0,143,227,0.1)" : "transparent",
                  border: paymentMethod === "venmo" ? "1px solid #008CFF" : "1px solid var(--border)",
                  color: paymentMethod === "venmo" ? "#008CFF" : "var(--text-secondary)",
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >Venmo</button>
            </div>

            {paymentMethod === "cashapp" ? (
              <>
                <p style={{ margin: "0 0 8px" }}>Send <strong style={{ color: "var(--text-primary)" }}>${total.toFixed(2)}</strong> to <strong style={{ color: "#00D632" }}>$TierOneBio</strong></p>
                <p style={{ margin: "0 0 20px", color: "var(--text-dim)", fontSize: 14 }}>Paste the order number in the Cash App note so we can match your payment.</p>

                <a
                  href={`https://cash.app/$TierOneBio/${total.toFixed(2)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handlePaymentInitiated("Cash App")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    width: "100%",
                    padding: "16px 0",
                    background: "#00D632",
                    border: "none",
                    color: "#fff",
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxSizing: "border-box",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                    <path d="M23.59 3.47A5.1 5.1 0 0 0 20.55.42 5.07 5.07 0 0 0 17.13 0H6.87a5.07 5.07 0 0 0-3.42.42A5.1 5.1 0 0 0 .42 3.47 5.07 5.07 0 0 0 0 6.87v10.26a5.07 5.07 0 0 0 .42 3.42 5.1 5.1 0 0 0 3.05 3.05 5.07 5.07 0 0 0 3.42.42h10.26a5.07 5.07 0 0 0 3.42-.42 5.1 5.1 0 0 0 3.05-3.05 5.07 5.07 0 0 0 .42-3.42V6.87a5.1 5.1 0 0 0-.45-3.4zM17.4 10.29l-.87.87a.46.46 0 0 1-.36.15.48.48 0 0 1-.36-.15c-.87-.87-1.32-.87-1.56-.87-.42 0-.78.36-.78.78 0 .18.06.36.18.48.12.12.24.18.42.24l.84.3c1.38.48 2.22 1.38 2.22 2.94a3.09 3.09 0 0 1-2.1 3v.84a.48.48 0 0 1-.48.48h-.96a.48.48 0 0 1-.48-.48v-.78a4.03 4.03 0 0 1-2.1-1.14.48.48 0 0 1 0-.66l.84-.84a.48.48 0 0 1 .66 0c.72.66 1.32.84 1.8.84a1.2 1.2 0 0 0 1.2-1.2c0-.42-.24-.78-1.08-1.08l-.78-.3c-.96-.36-2.28-1.08-2.28-2.88a2.79 2.79 0 0 1 1.98-2.64v-.78a.48.48 0 0 1 .48-.48h.96a.48.48 0 0 1 .48.48v.72a3.3 3.3 0 0 1 1.68.9.48.48 0 0 1 .06.66z" />
                  </svg>
                  OPEN CASH APP
                </a>
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 8px" }}>Send <strong style={{ color: "var(--text-primary)" }}>${total.toFixed(2)}</strong> to <strong style={{ color: "#008CFF" }}>@TierOneBio</strong></p>
                <p style={{ margin: "0 0 20px", color: "var(--text-dim)", fontSize: 14 }}>Paste the order number in the Venmo note so we can match your payment.</p>

                <a
                  href={`https://venmo.com/u/TierOneBio?txn=pay&amount=${total.toFixed(2)}&note=${encodeURIComponent(orderNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handlePaymentInitiated("Venmo")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    width: "100%",
                    padding: "16px 0",
                    background: "#008CFF",
                    border: "none",
                    color: "#fff",
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    boxSizing: "border-box",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                    <path d="M19.59 0H4.41A4.41 4.41 0 0 0 0 4.41v15.18A4.41 4.41 0 0 0 4.41 24h15.18A4.41 4.41 0 0 0 24 19.59V4.41A4.41 4.41 0 0 0 19.59 0zm-3.34 18.7H8.13L4.93 5.16h3.94l1.74 9.13c.46-.74 1.03-1.92 1.03-2.72 0-2.21-1.94-3.7-1.94-3.7l3.05-2.71c1.55 1.74 2.4 3.61 2.4 6.02 0 3.07-2.62 7.08-3 7.52z" />
                  </svg>
                  OPEN VENMO
                </a>
              </>
            )}

            {/* MUST-RETURN warning — shown before they leave so they know to come back and confirm */}
            <div style={{
              marginTop: 20,
              padding: "14px 16px",
              border: "1px solid rgba(245,158,11,0.5)",
              background: "rgba(245,158,11,0.08)",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1.3 }}>⚠️</span>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <strong style={{ color: "#f59e0b" }}>Don't close this page.</strong> After you send payment in {paymentMethod === "venmo" ? "Venmo" : "Cash App"}, <strong style={{ color: "var(--text-primary)" }}>come back here</strong> and tap <strong style={{ color: "var(--text-primary)" }}>"I have sent payment"</strong> below. Your order will not be processed until you confirm it here.
              </span>
            </div>

            <p style={{ margin: "20px 0 0", fontWeight: 600, color: "var(--text-primary)", fontSize: 17 }}>
              Step 3: {paymentInitiated ? "Confirm your payment below" : "Confirm below — after you've paid"}
            </p>
          </div>
        </div>

        {returnedFromPayment && (
          <div style={{
            padding: "14px 18px",
            marginBottom: 16,
            border: "1px solid #22c55e",
            background: "rgba(34,197,94,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            animation: "pulseReturn 1.6s ease-in-out infinite",
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "#22c55e",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}>Welcome back</span>
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.4,
            }}>Once your payment is sent, tap "I have sent payment" below to finalize your order.</span>
          </div>
        )}

        {orderSubmitError && (
          <div role="alert" style={{
            marginBottom: 16,
            padding: "14px 16px",
            border: "1px solid var(--red-primary)",
            background: "rgba(196,30,42,0.08)",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 15,
            color: "var(--text-primary)",
            lineHeight: 1.6,
          }}>{orderSubmitError}</div>
        )}

        {paymentInitiated ? (
          <button
            id="confirm-payment-btn"
            onClick={handlePaymentConfirmed}
            disabled={orderSubmitting}
            aria-busy={orderSubmitting}
            style={{
              width: "100%",
              padding: "16px 0",
              background: orderSubmitting ? "var(--bg-card-hover)" : "var(--red-primary)",
              border: "1px solid var(--red-primary)",
              color: orderSubmitting ? "var(--text-secondary)" : "#fff",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: orderSubmitting ? "wait" : "pointer",
              transition: "all 0.2s",
              marginBottom: 16,
              boxShadow: returnedFromPayment && !orderSubmitting ? "0 0 0 0 rgba(196,30,42,0.6)" : "none",
              animation: returnedFromPayment && !orderSubmitting ? "pulseConfirm 1.6s ease-out infinite" : "none",
            }}
            onMouseEnter={e => { if (orderSubmitting) return; e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { if (orderSubmitting) return; e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >{orderSubmitting ? "SAVING YOUR ORDER…" : (orderSubmitError ? "RETRY CONFIRMATION" : "I HAVE SENT PAYMENT")}</button>
        ) : (
          <div style={{
            width: "100%",
            padding: "16px 0",
            border: "1px dashed var(--border)",
            background: "rgba(17,17,17,0.4)",
            color: "var(--text-dim)",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 14,
            textAlign: "center",
            lineHeight: 1.5,
            marginBottom: 16,
            boxSizing: "border-box",
          }}>
            Tap <strong style={{ color: "var(--text-secondary)" }}>Open {paymentMethod === "venmo" ? "Venmo" : "Cash App"}</strong> above first.<br />Your confirmation button will appear here once you do.
          </div>
        )}

        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 14,
          color: "var(--text-dim)",
          textAlign: "center",
          lineHeight: 1.6,
        }}>
          Orders are processed within 24 hours of payment confirmation.
          <br />If you have questions, contact us at sales@tierone.bio
        </div>
      </div>
    );
  }

  // ─── Customer Info Screen ────────────────────────────
  if (step === "info") {
    // The research-use acknowledgement is part of the gate, not a footnote. A
    // "research use only" disclaimer that a buyer never has to read or agree to
    // is exactly the arrangement recent FDA warning letters have treated as
    // decorative, so this one has to be ticked before the order can proceed.
    const allFilled = customerInfo.name && customerInfo.email && customerInfo.phone &&
      customerInfo.address && customerInfo.city && customerInfo.state && customerInfo.zip &&
      researchAcknowledged;

    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--red-primary)",
            marginBottom: 10,
          }}>STEP 2 OF 3</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 28,
            color: "var(--text-primary)",
          }}>SHIPPING DETAILS</h2>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (allFilled) handleCheckout(); }} style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>
          <input type="hidden" name="form-name" value="order" />

          <div>
            <label style={labelStyle}>Full Name *</label>
            <input
              type="text"
              required
              value={customerInfo.name}
              onChange={e => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
              style={inputStyle}
              placeholder="John Doe"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
            <div>
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                required
                value={customerInfo.email}
                onChange={e => setCustomerInfo(prev => ({ ...prev, email: e.target.value }))}
                style={inputStyle}
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label style={labelStyle}>Phone *</label>
              <input
                type="tel"
                required
                value={customerInfo.phone}
                onChange={e => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                style={inputStyle}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Street Address *</label>
            <input
              type="text"
              required
              value={customerInfo.address}
              onChange={e => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
              style={inputStyle}
              placeholder="123 Main St, Apt 4"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 20 }}>
            <div>
              <label style={labelStyle}>City *</label>
              <input
                type="text"
                required
                value={customerInfo.city}
                onChange={e => setCustomerInfo(prev => ({ ...prev, city: e.target.value }))}
                style={inputStyle}
                placeholder="Austin"
              />
            </div>
            <div>
              <label style={labelStyle}>State *</label>
              <input
                type="text"
                required
                value={customerInfo.state}
                onChange={e => setCustomerInfo(prev => ({ ...prev, state: e.target.value }))}
                style={inputStyle}
                placeholder="TX"
              />
            </div>
            <div>
              <label style={labelStyle}>Zip Code *</label>
              <input
                type="text"
                required
                value={customerInfo.zip}
                onChange={e => setCustomerInfo(prev => ({ ...prev, zip: e.target.value }))}
                style={inputStyle}
                placeholder="78701"
              />
            </div>
          </div>

          {/* Order summary */}
          <div style={{
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.4)",
            padding: "20px 24px",
            marginTop: 8,
          }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--text-dim)",
              marginBottom: 12,
            }}>ORDER SUMMARY</div>
            {cart.map(item => {
              const unitPrice = getItemPrice(item);
              const isBulk = item.qty >= 5;
              return (
                <div key={item.id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 15,
                  color: "var(--text-secondary)",
                  padding: "4px 0",
                }}>
                  <span>{item.name} {item.dose} x{item.qty}{isBulk ? " (bulk)" : ""}</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>${(unitPrice * item.qty).toFixed(2)}</span>
                </div>
              );
            })}
            {isSaleActive() && (
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 13,
                padding: "10px 12px",
                marginTop: 12,
                border: "1px solid rgba(196,30,42,0.4)",
                background: "rgba(196,30,42,0.06)",
                gap: 8,
                flexWrap: "wrap",
              }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.15em", fontWeight: 700, color: "var(--red-primary)", textTransform: "uppercase" }}>{SITEWIDE_SALE.headline}</span>
                <span style={{ color: "#22c55e", fontWeight: 700 }}>You saved ${(subtotal * SITEWIDE_SALE.percentOff / (100 - SITEWIDE_SALE.percentOff)).toFixed(2)}</span>
              </div>
            )}
            {appliedDiscount && (
              <>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 15,
                  color: "var(--text-secondary)",
                  padding: "4px 0",
                  borderTop: "1px solid var(--border)",
                  marginTop: 8,
                  paddingTop: 10,
                }}>
                  <span>Subtotal</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
                </div>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 15,
                  color: "#22c55e",
                  padding: "4px 0",
                }}>
                  <span>Discount ({appliedDiscount.code})</span>
                  <span style={{ fontWeight: 600 }}>−${discountAmount.toFixed(2)}</span>
                </div>
              </>
            )}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              color: "var(--text-secondary)",
              padding: "4px 0",
              borderTop: appliedDiscount ? "none" : "1px solid var(--border)",
              marginTop: appliedDiscount ? 0 : 8,
              paddingTop: appliedDiscount ? 4 : 10,
            }}>
              <span>Shipping</span>
              <span style={{ color: shipping === 0 ? "#22c55e" : "var(--text-primary)", fontWeight: 600 }}>
                {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
              </span>
            </div>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid var(--border)",
              marginTop: 12,
              paddingTop: 12,
            }}>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, letterSpacing: "0.1em", color: "var(--text-secondary)" }}>TOTAL</span>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>${total.toFixed(2)}</span>
            </div>
          </div>

          <label htmlFor="research-acknowledgment" style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            marginTop: 8,
            padding: "16px 18px",
            border: "1px solid var(--border)",
            background: "rgba(17,17,17,0.5)",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}>
            <input
              id="research-acknowledgment"
              name="researchUseAcknowledgment"
              type="checkbox"
              required
              checked={researchAcknowledged}
              onChange={e => setResearchAcknowledged(e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 1, accentColor: "var(--red-primary)", flexShrink: 0 }}
            />
            <span>
              I confirm this purchase is solely for in-vitro laboratory research — not for human or
              veterinary use — and I agree to the{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--red-primary)" }}>Terms of Service</a>.
            </span>
          </label>

          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <button type="button" onClick={() => setStep("cart")} style={{
              flex: 1,
              padding: "14px 0",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}>Back to Cart</button>
            <button type="submit" disabled={!allFilled} style={{
              flex: 2,
              padding: "14px 0",
              background: allFilled ? "var(--red-primary)" : "rgba(196,30,42,0.3)",
              border: "1px solid var(--red-primary)",
              color: allFilled ? "#fff" : "rgba(255,255,255,0.4)",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: allFilled ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}>Proceed to Payment</button>
          </div>
        </form>
      </div>
    );
  }

  // ─── Cart Screen (Step 1) ────────────────────────────
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>STEP 1 OF 3</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 5vw, 42px)",
          color: "var(--text-primary)",
          textTransform: "uppercase",
        }}>YOUR CART</h2>
      </div>

      {cart.length === 0 ? (
        <div style={{
          textAlign: "center",
          border: "1px solid var(--border)",
          background: "rgba(17,17,17,0.4)",
          padding: "64px 32px",
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🛒</div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 18,
            color: "var(--text-secondary)",
            marginBottom: 24,
          }}>Your cart is empty.</div>
          <button onClick={() => { navigate("/"); setTimeout(() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }), 50); }} style={{
            padding: "12px 32px",
            background: "var(--red-primary)",
            border: "none",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}>Browse Products</button>
        </div>
      ) : (
        <>
          <div style={{ border: "1px solid var(--border)", background: "rgba(17,17,17,0.4)", padding: "0 24px" }}>
            {cart.map(item => {
              const unitPrice = getItemPrice(item);
              const isBulk = item.qty >= 5;
              const tierLabel = item.qty >= 25 ? "25+ TIER" : item.qty >= 10 ? "10+ TIER" : item.qty >= 5 ? "5+ TIER" : null;
              return (
                <div key={item.id} style={rowStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                    <div style={{
                      width: 56,
                      height: 56,
                      flexShrink: 0,
                      border: "1px solid var(--border)",
                      background: "#080808",
                      overflow: "hidden",
                    }}>
                      <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: 4,
                    }}>{item.name} {item.dose}</div>
                    <div style={{
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 15,
                      color: isBulk ? "var(--red-primary)" : "var(--text-secondary)",
                      fontWeight: isBulk ? 700 : 400,
                    }}>
                      ${unitPrice.toFixed(2)} /vial
                      {tierLabel && <span style={{ fontSize: 12, marginLeft: 8, color: "#22c55e", fontWeight: 700, letterSpacing: "0.05em" }}>{tierLabel}</span>}
                    </div>
                    {!isBulk && item.qty >= 3 && (
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        marginTop: 2,
                      }}>Add {5 - item.qty} more for ${catalogPrices(item).bulk}/vial</div>
                    )}
                    {item.qty >= 5 && item.qty < 10 && (
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        marginTop: 2,
                      }}>Add {10 - item.qty} more for an extra 5% off</div>
                    )}
                    {item.qty >= 10 && item.qty < 25 && (
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        marginTop: 2,
                      }}>Add {25 - item.qty} more for an extra 10% off</div>
                    )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, justifySelf: "center" }}>
                    {[[-1,"−"],[1,"+"]].map(([delta, label]) => (
                      <button key={delta} onClick={() => updateQty(item.id, delta)} style={{
                        width: 32, height: 32,
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 18,
                        cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                        onMouseEnter={e => { e.target.style.borderColor = "var(--red-primary)"; e.target.style.color = "var(--red-primary)"; }}
                        onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
                      >{label}</button>
                    ))}
                    <span style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      minWidth: 24,
                      textAlign: "center",
                    }}>{item.qty}</span>
                  </div>

                  <div style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    textAlign: "right",
                  }}>${(unitPrice * item.qty).toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          {/* Discount code section — hidden while sitewide sale is active */}
          {!isSaleActive() && (
          <div style={{
            padding: "24px 0 8px",
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.15em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}>Discount Code</div>
            {[
              appliedDiscount && { applied: appliedDiscount, onRemove: removeDiscountCode },
              appliedShipping && { applied: appliedShipping, onRemove: removeShippingCode },
            ].filter(Boolean).map(({ applied, onRemove }) => (
              <div key={applied.code} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                border: "1px solid rgba(34,197,94,0.3)",
                background: "rgba(34,197,94,0.05)",
                marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#22c55e",
                    letterSpacing: "0.1em",
                  }}>{applied.code}</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 14,
                    color: "var(--text-secondary)",
                  }}>— {applied.label} applied</span>
                </div>
                <button
                  type="button"
                  onClick={onRemove}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    padding: "6px 12px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--red-primary)"; e.currentTarget.style.color = "var(--red-primary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >Remove</button>
              </div>
            ))}
            {(!appliedDiscount || !appliedShipping) && (
              <div style={{ marginBottom: 16, marginTop: (appliedDiscount || appliedShipping) ? 6 : 0 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={discountInput}
                    disabled={discountLoading}
                    onChange={e => { setDiscountInput(e.target.value); if (discountError) setDiscountError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyDiscountCode(); } }}
                    placeholder={appliedDiscount ? "Add a free-shipping code" : appliedShipping ? "Add a discount code" : "Enter code"}
                    style={{
                      flex: 1,
                      padding: "12px 16px",
                      background: "rgba(17,17,17,0.8)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 15,
                      outline: "none",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      boxSizing: "border-box",
                      opacity: discountLoading ? 0.6 : 1,
                    }}
                  />
                  <button
                    type="button"
                    onClick={applyDiscountCode}
                    disabled={discountLoading}
                    style={{
                      padding: "0 22px",
                      background: "transparent",
                      border: "1px solid var(--red-primary)",
                      color: "var(--red-primary)",
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      cursor: discountLoading ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                      opacity: discountLoading ? 0.6 : 1,
                    }}
                    onMouseEnter={e => { if (!discountLoading) { e.currentTarget.style.background = "var(--red-primary)"; e.currentTarget.style.color = "#fff"; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--red-primary)"; }}
                  >{discountLoading ? "Checking…" : "Apply"}</button>
                </div>
                {discountError && (
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 13,
                    color: "var(--red-primary)",
                    marginTop: 8,
                  }}>{discountError}</div>
                )}
              </div>
            )}
          </div>
          )}

          <div style={{
            padding: "20px 0 8px",
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              color: "var(--text-secondary)",
              paddingBottom: 8,
            }}>
              <span>Subtotal</span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
            </div>
            {appliedDiscount && (
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 15,
                color: "#22c55e",
                paddingBottom: 8,
              }}>
                <span>Discount ({appliedDiscount.code})</span>
                <span style={{ fontWeight: 600 }}>−${discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 15,
              color: "var(--text-secondary)",
              paddingBottom: 8,
            }}>
              <span>Shipping</span>
              <span style={{ color: shipping === 0 ? "#22c55e" : "var(--text-primary)", fontWeight: 600 }}>
                {shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`}
              </span>
            </div>
            {shipping > 0 && subtotalAfterDiscount < FREE_SHIPPING_THRESHOLD && (
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 13,
                color: "var(--text-dim)",
                fontStyle: "italic",
              }}>Add ${(FREE_SHIPPING_THRESHOLD - subtotalAfterDiscount).toFixed(2)} more for free shipping</div>
            )}
          </div>

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 0 24px",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            marginBottom: 32,
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 13,
              letterSpacing: "0.1em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}>Total</span>
            <span style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
            }}>${total.toFixed(2)}</span>
          </div>

          {/* Account gate — encourage sign-in for order tracking, allow guest fallback */}
          {isLoggedIn ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              marginBottom: 16,
              border: "1px solid rgba(34,197,94,0.3)",
              background: "rgba(34,197,94,0.05)",
            }}>
              <span style={{ color: "#22c55e", fontSize: 16 }}>✓</span>
              <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, color: "var(--text-secondary)" }}>
                Signed in as <strong style={{ color: "var(--text-primary)" }}>{user.email}</strong> — your shipping details are pre-filled and this order will be saved to your account.
              </span>
            </div>
          ) : !guestMode ? (
            <div style={{
              padding: "20px 22px",
              marginBottom: 16,
              border: "1px solid rgba(196,30,42,0.3)",
              background: "rgba(196,30,42,0.04)",
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--text-primary)",
                marginBottom: 8,
              }}>Track your order</div>
              <p style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 15,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                margin: "0 0 16px",
              }}>Sign in or create an account to save your shipping info and view your full order history. It only takes a moment.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <button onClick={() => navigate("/login?redirect=/cart")} style={{
                  padding: "14px 0",
                  background: "var(--red-primary)",
                  border: "1px solid var(--red-primary)",
                  color: "#fff",
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                  onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
                  onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
                >Sign In</button>
                <button onClick={() => navigate("/signup?redirect=/cart")} style={{
                  padding: "14px 0",
                  background: "transparent",
                  border: "1px solid var(--red-primary)",
                  color: "var(--red-primary)",
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                  onMouseEnter={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
                  onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
                >Create Account</button>
              </div>
              <button onClick={() => setGuestMode(true)} style={{
                width: "100%",
                background: "transparent",
                border: "none",
                color: "var(--text-dim)",
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}>Continue as guest →</button>
            </div>
          ) : null}

          {(isLoggedIn || guestMode) && (
            <button onClick={() => setStep("info")} style={{
              width: "100%",
              padding: "16px 0",
              background: "var(--red-primary)",
              border: "1px solid var(--red-primary)",
              color: "#fff",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "all 0.2s",
              marginBottom: 16,
            }}
              onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
              onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
            >PROCEED TO CHECKOUT</button>
          )}

          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 13,
            color: "var(--text-secondary)",
            textAlign: "center",
            opacity: 0.7,
          }}>All products sold for research use only. Not for human consumption.</div>
        </>
      )}
    </div>
  );
}

// ─── Lab Results Page ─────────────────────────────────────────────────────────

function LabResultsPage() {
  useRouteMeta("/lab-results");
  const [searchParams] = useSearchParams();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);

  // Auto-expand product if navigated from a product page. Only a summary that
  // survives the quantity check can be auto-opened — otherwise a link from a
  // withheld product would expand an empty panel.
  const productParam = searchParams.get("product");
  const doseParam = searchParams.get("dose");
  const [expandedProduct, setExpandedProduct] = useState(() => {
    if (!productParam) return null;
    if (!getLabResults(productParam, doseParam)) return null;
    const doseKey = doseParam ? `${productParam} ${doseParam}` : productParam;
    return LAB_RESULTS[doseKey] ? doseKey : productParam;
  });

  // Scroll to the summary the customer arrived for. Deliberately mount-only:
  // it reacts to the ?product= parameter in the URL, not to the accordion being
  // opened by hand afterwards — re-running it on every toggle would yank the
  // page around under someone who is just browsing.
  const arrivedExpanded = useRef(expandedProduct);
  useEffect(() => {
    const target = arrivedExpanded.current;
    if (!target) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`coa-${target}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Build the list of products whose summary actually describes the vial being
  // sold. getLabResults() applies the quantity reconciliation, so anything it
  // refuses is listed separately below as under re-verification rather than
  // being quietly dropped.
  const uniqueProducts = [];
  const withheld = [];
  const seen = new Set();
  PRODUCTS.forEach(p => {
    const doseKey = `${p.name} ${p.dose}`;
    const hasDoseEntry = !!LAB_RESULTS[doseKey];
    const coaKey = hasDoseEntry ? doseKey : p.name;
    if (seen.has(coaKey)) return;
    seen.add(coaKey);
    const displayName = hasDoseEntry ? `${p.name} — ${p.dose}` : p.name;
    if (getLabResults(p.name, p.dose)) {
      uniqueProducts.push({ ...p, coaKey, displayName });
    } else if (isLabResultWithheld(p.name, p.dose)) {
      withheld.push({ ...p, coaKey, displayName: `${p.name} — ${p.dose}` });
    }
  });

  return (
    <div style={{ paddingTop: 100, paddingBottom: 80, maxWidth: 1100, margin: "0 auto", padding: "100px 24px 80px" }}>
      {/* Page header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>QUALITY ASSURANCE</div>
        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: isMobile ? 24 : 32,
          letterSpacing: "0.05em",
          marginBottom: 16,
        }}>CERTIFICATES OF ANALYSIS</h1>
        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          fontWeight: 500,
          color: "var(--text-secondary)",
          maxWidth: 650,
          margin: "0 auto",
          lineHeight: 1.7,
        }}>
          Analytical summaries for the lots currently in stock. Each one is published only
          where the tested vial quantity matches the product it is attached to; anything that
          does not reconcile is withheld until the original report has been re-checked.
        </p>
      </div>

      {/* Product COA list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {uniqueProducts.map(product => {
          const coa = LAB_RESULTS[product.coaKey];
          if (!coa) return null;
          const isExpanded = expandedProduct === product.coaKey;

          return (
            <div key={product.coaKey} id={`coa-${product.coaKey}`} style={{
              border: isExpanded ? "1px solid rgba(196,30,42,0.4)" : "1px solid var(--border)",
              background: "var(--bg-card)",
              transition: "all 0.3s ease",
            }}>
              {/* Header row. A real <button> so it is reachable by Tab and
                  operable with Enter/Space, and so screen readers announce the
                  expanded state. */}
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`coa-panel-${product.coaKey}`}
                onClick={() => setExpandedProduct(isExpanded ? null : product.coaKey)}
                style={{
                  display: "flex",
                  alignItems: isMobile ? "stretch" : "center",
                  flexDirection: isMobile ? "column" : "row",
                  justifyContent: "space-between",
                  padding: isMobile ? "16px 16px" : "18px 28px",
                  cursor: "pointer",
                  gap: isMobile ? 12 : 16,
                  width: "100%",
                  background: "none",
                  border: "none",
                  color: "inherit",
                  textAlign: "left",
                  font: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    fontSize: isMobile ? 14 : 16,
                    letterSpacing: "0.03em",
                    whiteSpace: isMobile ? "normal" : "nowrap",
                    overflow: isMobile ? "visible" : "hidden",
                    textOverflow: isMobile ? "clip" : "ellipsis",
                    lineHeight: 1.35,
                  }}>{product.displayName}</div>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 13,
                    color: "var(--text-dim)",
                    whiteSpace: "nowrap",
                    display: isMobile ? "none" : "block",
                  }}>Lot: {coa.lotNumber}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "space-between" : "flex-start", gap: 16, flexShrink: 0, width: isMobile ? "100%" : "auto" }}>
                  <span style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    padding: "4px 12px",
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    color: "#22c55e",
                  }}>{isMobile ? "PASSED" : "ALL TESTS PASSED"}</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 20,
                    color: "var(--text-secondary)",
                    transition: "transform 0.3s",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    display: "inline-block",
                  }}>&#9660;</span>
                </div>
              </button>

              {/* Expanded COA details */}
              {isExpanded && (
                <div id={`coa-panel-${product.coaKey}`} style={{
                  borderTop: "1px solid var(--border)",
                  padding: isMobile ? "20px 16px" : "28px 28px",
                  animation: "fadeIn 0.25s ease-out",
                }}>
                  {/* COA header info */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                    gap: 16,
                    marginBottom: 24,
                  }}>
                    {[
                      { label: "LOT NUMBER", value: coa.lotNumber },
                      { label: "DATE ANALYZED", value: coa.dateAnalyzed },
                      { label: "MOLECULAR WEIGHT", value: coa.molecularWeight },
                    ].map((item, i) => (
                      <div key={i} style={{
                        padding: "12px 16px",
                        border: "1px solid var(--border)",
                        background: "rgba(17,17,17,0.5)",
                      }}>
                        <div style={{
                          fontFamily: "'Orbitron', sans-serif",
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.1em",
                          color: "var(--text-dim)",
                          marginBottom: 4,
                        }}>{item.label}</div>
                        <div style={{
                          fontFamily: "'Rajdhani', sans-serif",
                          fontSize: 15,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Results table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: isMobile ? 13 : 15,
                    }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid rgba(196,30,42,0.3)" }}>
                          {["Test", "Method", "Specification", "Result", "Status"].map(h => (
                            <th key={h} style={{
                              fontFamily: "'Orbitron', sans-serif",
                              fontSize: isMobile ? 9 : 10,
                              fontWeight: 700,
                              letterSpacing: "0.1em",
                              color: "var(--text-dim)",
                              textAlign: "left",
                              padding: "8px 12px",
                              whiteSpace: "nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {coa.tests.map((t, i) => (
                          <tr key={i} style={{
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                          }}>
                            <td style={{
                              padding: "10px 12px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              whiteSpace: isMobile ? "normal" : "nowrap",
                            }}>{t.test}</td>
                            <td style={{
                              padding: "10px 12px",
                              color: "var(--text-secondary)",
                            }}>{t.method}</td>
                            <td style={{
                              padding: "10px 12px",
                              color: "var(--text-secondary)",
                            }}>{t.specification}</td>
                            <td style={{
                              padding: "10px 12px",
                              color: "var(--text-primary)",
                              fontWeight: 600,
                            }}>{t.result}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{
                                fontFamily: "'Orbitron', sans-serif",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                padding: "3px 8px",
                                background: t.pass ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                                border: t.pass ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)",
                                color: t.pass ? "#22c55e" : "#ef4444",
                              }}>{t.pass ? "PASS" : "FAIL"}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* COA footer */}
                  <div style={{
                    marginTop: 20,
                    padding: "14px 18px",
                    border: "1px solid rgba(34,197,94,0.15)",
                    background: "rgba(34,197,94,0.03)",
                    display: "flex",
                    alignItems: isMobile ? "flex-start" : "center",
                    justifyContent: "space-between",
                    flexDirection: isMobile ? "column" : "row",
                    gap: 12,
                  }}>
                    <div>
                      <div style={{
                        fontFamily: "'Orbitron', sans-serif",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: "#22c55e",
                        marginBottom: 4,
                      }}>OVERALL RESULT: PASS</div>
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: 14,
                        color: "var(--text-secondary)",
                      }}>All specifications met. Product released for distribution.</div>
                    </div>
                    <div style={{
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: 13,
                      color: "var(--text-dim)",
                      whiteSpace: "nowrap",
                    }}>Analyzed: {coa.dateAnalyzed}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summaries that do not reconcile with the product they belong to. Saying
          so plainly is the honest option — and it is far better for trust than
          a page that silently has gaps in it. */}
      {withheld.length > 0 && (
        <div style={{
          marginTop: 32,
          padding: "20px 24px",
          border: "1px solid rgba(196,30,42,0.25)",
          background: "rgba(196,30,42,0.04)",
        }}>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "var(--red-primary)",
            marginBottom: 10,
            textTransform: "uppercase",
          }}>Under re-verification</h2>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 15,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            marginBottom: 12,
          }}>
            The analytical summary we hold for these compounds records a different vial
            quantity than the product listing. Rather than show a report that may belong to
            another lot, we are withholding it until the original laboratory document has been
            re-checked and the lot mapping corrected. Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--red-primary)" }}>{CONTACT_EMAIL}</a>{" "}
            if you need the report for a specific lot in the meantime.
          </p>
          <ul style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 15,
            color: "var(--text-primary)",
            lineHeight: 1.8,
            paddingLeft: 20,
          }}>
            {withheld.map(p => <li key={p.coaKey}>{p.displayName}</li>)}
          </ul>
        </div>
      )}

      {/* Bottom disclaimer */}
      <div style={{
        marginTop: 48,
        padding: "18px 24px",
        border: "1px solid rgba(196,30,42,0.15)",
        background: "rgba(196,30,42,0.03)",
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: "var(--red-primary)",
          marginBottom: 8,
        }}>ABOUT THESE RESULTS</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 15,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          maxWidth: 700,
          margin: "0 auto",
        }}>
          The figures above are summaries of the analytical testing held for the most recent
          production lot of each compound. They are not a substitute for the original
          laboratory-issued report; request the signed document for a specific lot number at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--red-primary)" }}>{CONTACT_EMAIL}</a>.
        </div>
      </div>
    </div>
  );
}

// ─── Auth Page (Sign In / Create Account) ─────────────────────────────────────

const AUTH_INPUT_STYLE = {
  width: "100%",
  padding: "12px 16px",
  background: "rgba(17,17,17,0.8)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontFamily: "'Rajdhani', sans-serif",
  fontSize: 16,
  outline: "none",
  boxSizing: "border-box",
};
const AUTH_LABEL_STYLE = {
  fontFamily: "'Orbitron', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.15em",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  marginBottom: 8,
  display: "block",
};

function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, resendConfirmation, isLoggedIn, loading: authLoading } = useAuth();
  const isSignup = location.pathname === "/signup";
  // Only allow same-site paths. A value like "//evil.com" or "https://evil.com"
  // would otherwise send a just-authenticated customer off to a phishing page.
  const rawRedirect = searchParams.get("redirect") || "/account";
  const redirectTo = /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : "/account";
  useRouteMeta(isSignup ? "/signup" : "/login");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zip, setZip] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  // Set when the customer arrived here from a dead confirmation link.
  const authError = searchParams.get("auth_error");
  const linkExpired = !!authError && /expired|invalid|access_denied/i.test(authError);
  // Set when a resent confirmation link was followed successfully.
  const justConfirmed = searchParams.get("confirmed") === "1";
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // Already signed in → skip straight to the intended destination.
  useEffect(() => {
    if (!authLoading && isLoggedIn) navigate(redirectTo, { replace: true });
  }, [authLoading, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turn a raw auth error into something a customer can actually read.
  function cleanAuthError(err) {
    const raw = (err && typeof err.message === "string") ? err.message.trim() : "";
    // A 504 gateway timeout surfaces as an empty "{}" body — almost always the
    // confirmation email hanging on a misconfigured SMTP server.
    if (!raw || raw === "{}" || /timed out|deadline exceeded|gateway|504/i.test(raw)) {
      return "We couldn't finish creating your account just now — the server timed out. Please try again in a moment.";
    }
    if (/rate limit/i.test(raw)) {
      return "Too many attempts right now. Please wait a minute and try again.";
    }
    return raw;
  }

  async function handleResend() {
    if (resending || !email) return;
    setResending(true);
    setError(""); setNotice("");
    try {
      const { error } = await resendConfirmation(email.trim());
      if (error) setError(cleanAuthError(error));
      else setNotice("Sent. Check your inbox for a new confirmation link — it expires in a few hours, so try to click it soon.");
    } catch (err) {
      setError(cleanAuthError(err));
    } finally {
      setResending(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setNotice("");
    if (!email || !password) { setError("Enter your email and password."); return; }
    if (isSignup) {
      // Mirrors the minimum length enforced by Supabase Auth. This check is for
      // fast feedback only — the server-side setting is what actually enforces it.
      if (password.length < 10) { setError("Password must be at least 10 characters."); return; }
      if (!fullName || !phone || !address || !city || !stateField || !zip) {
        setError("Please fill in all fields."); return;
      }
    }
    setSubmitting(true);
    try {
      if (isSignup) {
        const { data, error } = await signUp(email, password, {
          full_name: fullName, phone, address, city, state: stateField, zip,
        });
        if (error) setError(cleanAuthError(error));
        else if (data.session) navigate(redirectTo, { replace: true });
        else setNotice("Account created! Check your email to confirm your address, then sign in.");
      } else {
        const { error } = await signIn(email, password);
        if (error) setError(cleanAuthError(error));
        else navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(cleanAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const otherPath = (isSignup ? "/login" : "/signup") + (searchParams.get("redirect") ? `?redirect=${encodeURIComponent(redirectTo)}` : "");

  return (
    <div style={{ maxWidth: isSignup ? 700 : 460, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>{isSignup ? "JOIN TIER ONE" : "WELCOME BACK"}</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 28,
          color: "var(--text-primary)",
        }}>{isSignup ? "CREATE ACCOUNT" : "SIGN IN"}</h2>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {isSignup ? (
          <>
            {/* Mirrors the checkout shipping form so the experience stays consistent */}
            <div>
              <label style={AUTH_LABEL_STYLE}>Full Name *</label>
              <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="John Doe" autoComplete="name" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18 }}>
              <div>
                <label style={AUTH_LABEL_STYLE}>Email *</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="john@example.com" autoComplete="email" />
              </div>
              <div>
                <label style={AUTH_LABEL_STYLE}>Phone *</label>
                <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="(555) 123-4567" autoComplete="tel" />
              </div>
            </div>

            <div>
              <label style={AUTH_LABEL_STYLE}>Password *</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="At least 10 characters" autoComplete="new-password" />
            </div>

            <div>
              <label style={AUTH_LABEL_STYLE}>Street Address *</label>
              <input type="text" required value={address} onChange={e => setAddress(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="123 Main St, Apt 4" autoComplete="street-address" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 18 }}>
              <div>
                <label style={AUTH_LABEL_STYLE}>City *</label>
                <input type="text" required value={city} onChange={e => setCity(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="Austin" autoComplete="address-level2" />
              </div>
              <div>
                <label style={AUTH_LABEL_STYLE}>State *</label>
                <input type="text" required value={stateField} onChange={e => setStateField(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="TX" autoComplete="address-level1" />
              </div>
              <div>
                <label style={AUTH_LABEL_STYLE}>Zip Code *</label>
                <input type="text" required value={zip} onChange={e => setZip(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="78701" autoComplete="postal-code" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label style={AUTH_LABEL_STYLE}>Email *</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="john@example.com" autoComplete="email" />
            </div>
            <div>
              <label style={AUTH_LABEL_STYLE}>Password *</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={AUTH_INPUT_STYLE} placeholder="Your password" autoComplete="current-password" />
            </div>
          </>
        )}

        {justConfirmed && !notice && !error && (
          <div style={{ padding: "10px 14px", border: "1px solid rgba(34,197,94,0.5)", background: "rgba(34,197,94,0.08)", color: "#22c55e", fontFamily: "'Rajdhani', sans-serif", fontSize: 14 }}>
            Email confirmed. Sign in below to continue.
          </div>
        )}
        {linkExpired && !notice && (
          <div style={{ padding: "14px 16px", border: "1px solid rgba(196,30,42,0.5)", background: "rgba(196,30,42,0.08)", fontFamily: "'Rajdhani', sans-serif", fontSize: 14, lineHeight: 1.6 }}>
            <div style={{ color: "#ff6b6b", fontWeight: 700, marginBottom: 6 }}>That confirmation link has expired</div>
            <div style={{ color: "var(--text-secondary)", marginBottom: 12 }}>
              Confirmation links are single-use and time-limited. Enter your email below and we&rsquo;ll send you a fresh one.
            </div>
            <button
              type="button"
              disabled={resending || !email}
              onClick={handleResend}
              style={{
                padding: "10px 18px",
                background: "transparent",
                border: "1px solid var(--red-primary)",
                color: "var(--red-primary)",
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: (resending || !email) ? "not-allowed" : "pointer",
                opacity: (resending || !email) ? 0.5 : 1,
              }}
            >{resending ? "Sending…" : "Resend confirmation email"}</button>
            {!email && (
              <div style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 8 }}>Enter your email address above first.</div>
            )}
          </div>
        )}
        {error && (
          <div style={{ padding: "10px 14px", border: "1px solid rgba(196,30,42,0.5)", background: "rgba(196,30,42,0.08)", color: "#ff6b6b", fontFamily: "'Rajdhani', sans-serif", fontSize: 14 }}>{error}</div>
        )}
        {notice && (
          <div style={{ padding: "10px 14px", border: "1px solid rgba(34,197,94,0.5)", background: "rgba(34,197,94,0.08)", color: "#22c55e", fontFamily: "'Rajdhani', sans-serif", fontSize: 14 }}>{notice}</div>
        )}

        <button type="submit" disabled={submitting} style={{
          width: "100%",
          padding: "16px 0",
          background: submitting ? "rgba(196,30,42,0.3)" : "var(--red-primary)",
          border: "1px solid var(--red-primary)",
          color: "#fff",
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: submitting ? "not-allowed" : "pointer",
          transition: "all 0.2s",
        }}>{submitting ? "Please wait…" : isSignup ? "Create Account" : "Sign In"}</button>
      </form>

      <div style={{ textAlign: "center", marginTop: 24, fontFamily: "'Rajdhani', sans-serif", fontSize: 15, color: "var(--text-secondary)" }}>
        {isSignup ? "Already have an account? " : "Don't have an account? "}
        <span onClick={() => navigate(otherPath)} style={{ color: "var(--red-primary)", cursor: "pointer", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
          {isSignup ? "Sign in" : "Create one"}
        </span>
      </div>
    </div>
  );
}

// ─── Account Page (Profile + Order History) ───────────────────────────────────

function AccountPage() {
  const navigate = useNavigate();
  const { user, profile, isLoggedIn, loading: authLoading, signOut, refreshProfile } = useAuth();
  useRouteMeta("/account");

  const [form, setForm] = useState({ full_name: "", phone: "", address: "", city: "", state: "", zip: "" });
  const [orders, setOrders] = useState(null); // null = loading
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // Guard: send anonymous visitors to sign in.
  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate("/login?redirect=/account", { replace: true });
  }, [authLoading, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Populate the editable form once the profile loads from the DB.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (profile) setForm({
      full_name: profile.full_name || "",
      phone: profile.phone || "",
      address: profile.address || "",
      city: profile.city || "",
      state: profile.state || "",
      zip: profile.zip || "",
    });
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data, error }) => { if (error) console.error("Load orders error:", error); setOrders(data || []); });
  }, [user]);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true); setSaved(false);
    const { error } = await supabase.from("profiles").update(form).eq("id", user.id);
    setSaving(false);
    if (error) { console.error("Save profile error:", error); return; }
    setSaved(true);
    refreshProfile();
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  if (authLoading || !isLoggedIn) return null;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 32 }}>
        <div>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", color: "var(--red-primary)", marginBottom: 10 }}>MY ACCOUNT</div>
          <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 28, color: "var(--text-primary)" }}>{profile?.full_name || user.email}</h2>
        </div>
        <button onClick={handleSignOut} style={{
          padding: "10px 22px",
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--red-primary)"; e.currentTarget.style.color = "var(--red-primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        >Sign Out</button>
      </div>

      {/* Profile / default shipping details */}
      <div style={{ border: "1px solid var(--border)", background: "rgba(17,17,17,0.4)", padding: "28px", marginBottom: 32 }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-primary)", textTransform: "uppercase", marginBottom: 6 }}>Profile & Shipping</div>
        <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, color: "var(--text-dim)", margin: "0 0 20px" }}>Saved here and pre-filled at checkout.</p>
        <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={AUTH_LABEL_STYLE}>Full Name</label>
            <input type="text" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} style={AUTH_INPUT_STYLE} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div>
              <label style={AUTH_LABEL_STYLE}>Email</label>
              <input type="email" value={user.email} disabled style={{ ...AUTH_INPUT_STYLE, opacity: 0.6, cursor: "not-allowed" }} />
            </div>
            <div>
              <label style={AUTH_LABEL_STYLE}>Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} style={AUTH_INPUT_STYLE} />
            </div>
          </div>
          <div>
            <label style={AUTH_LABEL_STYLE}>Street Address</label>
            <input type="text" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} style={AUTH_INPUT_STYLE} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={AUTH_LABEL_STYLE}>City</label>
              <input type="text" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} style={AUTH_INPUT_STYLE} />
            </div>
            <div>
              <label style={AUTH_LABEL_STYLE}>State</label>
              <input type="text" value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} style={AUTH_INPUT_STYLE} />
            </div>
            <div>
              <label style={AUTH_LABEL_STYLE}>Zip</label>
              <input type="text" value={form.zip} onChange={e => setForm(p => ({ ...p, zip: e.target.value }))} style={AUTH_INPUT_STYLE} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button type="submit" disabled={saving} style={{
              padding: "13px 32px",
              background: saving ? "rgba(196,30,42,0.3)" : "var(--red-primary)",
              border: "1px solid var(--red-primary)",
              color: "#fff",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: saving ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}>{saving ? "Saving…" : "Save Changes"}</button>
            {saved && <span style={{ color: "#22c55e", fontFamily: "'Rajdhani', sans-serif", fontSize: 15, fontWeight: 600 }}>✓ Saved</span>}
          </div>
        </form>
      </div>

      {/* Order history */}
      <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-primary)", textTransform: "uppercase", marginBottom: 16 }}>Order History</div>
      {orders === null ? (
        <p style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--text-dim)" }}>Loading your orders…</p>
      ) : orders.length === 0 ? (
        <div style={{ border: "1px solid var(--border)", background: "rgba(17,17,17,0.4)", padding: "32px", textAlign: "center" }}>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--text-secondary)", margin: "0 0 16px" }}>You haven't placed any orders yet.</p>
          <button onClick={() => navigate("/products")} style={{
            padding: "12px 28px",
            background: "var(--red-primary)",
            border: "1px solid var(--red-primary)",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}>Browse Products</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {orders.map(o => (
            <div key={o.id} style={{ border: "1px solid var(--border)", background: "rgba(17,17,17,0.4)", padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 800, color: "var(--red-primary)", letterSpacing: "0.05em" }}>{o.order_number}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>{formatOrderDate(o.created_at)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    border: "1px solid rgba(34,197,94,0.4)",
                    background: "rgba(34,197,94,0.08)",
                    color: "#22c55e",
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}>{o.status}</span>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--text-primary)", marginTop: 8 }}>${Number(o.total).toFixed(2)}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(o.items || []).map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Rajdhani', sans-serif", fontSize: 15, color: "var(--text-secondary)" }}>
                    <span>{it.name} {it.dose} <span style={{ color: "var(--text-dim)" }}>×{it.qty}</span></span>
                    <span>${Number(it.lineTotal).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)" }}>
                Paid via {o.payment_method} · Ship to {o.ship_city}, {o.ship_state}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatOrderDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ─── Age Verification Gate ────────────────────────────────────────────────────

function NotFoundPage() {
  usePageMeta("Page Not Found", "The page you're looking for doesn't exist.", { noindex: true });
  const navigate = useNavigate();
  return (
    <div style={{
      maxWidth: 600,
      margin: "0 auto",
      padding: "160px 24px 80px",
      textAlign: "center",
    }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 900,
        fontSize: 80,
        color: "var(--red-primary)",
        marginBottom: 16,
        opacity: 0.3,
      }}>404</div>
      <h1 style={{
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 800,
        fontSize: 24,
        letterSpacing: "0.05em",
        marginBottom: 16,
      }}>PAGE NOT FOUND</h1>
      <p style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 17,
        color: "var(--text-secondary)",
        lineHeight: 1.7,
        marginBottom: 32,
      }}>The page you're looking for doesn't exist or has been moved.</p>
      <button onClick={() => navigate("/")} style={{
        padding: "14px 36px",
        background: "var(--red-primary)",
        border: "1px solid var(--red-primary)",
        color: "#fff",
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}>Back to Home</button>
    </div>
  );
}

// ─── Policy / Info Pages ─────────────────────────────────────────────────────

function PolicyShell({ title, kicker, children }) {
  return (
    <div style={{ maxWidth: 850, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>{kicker}</div>
        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: "clamp(24px, 5vw, 36px)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>{title}</h1>
      </div>
      <div style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 17,
        lineHeight: 1.8,
        color: "var(--text-secondary)",
      }}>
        {children}
      </div>
    </div>
  );
}

const policyHeadingStyle = {
  fontFamily: "'Orbitron', sans-serif",
  fontWeight: 700,
  fontSize: 16,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  marginTop: 32,
  marginBottom: 12,
};

function ShippingPage() {
  useRouteMeta("/shipping");
  return (
    <>
      <PolicyShell kicker="POLICY" title="Shipping">
        <p>All orders are shipped from our facility in Phoenix, Arizona via UPS or FedEx in protective bubble mailers. Lyophilized research peptides are shelf-stable at room temperature for short transit periods, so cold-pack shipping is generally unnecessary for standard ground shipping windows.</p>

        <h2 style={policyHeadingStyle}>Shipping Rates</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>$10 flat rate</strong> on orders under $200. <strong style={{ color: "#22c55e" }}>FREE shipping</strong> on all orders $200 and over (after any discounts applied).</p>

        <h2 style={policyHeadingStyle}>Processing Time</h2>
        <p>Orders placed and paid before <strong style={{ color: "var(--text-primary)" }}>2:00 PM Arizona time</strong> ship the same business day. Orders placed after 2:00 PM, on weekends, or on US holidays ship the next business day. Payment must be received and confirmed before an order is processed.</p>

        <h2 style={policyHeadingStyle}>Delivery Time</h2>
        <p>Standard ground delivery within the continental US is typically 2–5 business days from ship date. You will receive a tracking number by email once your order ships.</p>

        <h2 style={policyHeadingStyle}>Domestic Only</h2>
        <p>We currently ship to the United States only. We do not ship internationally.</p>

        <h2 style={policyHeadingStyle}>Lost or Damaged Shipments</h2>
        <p>If your package arrives damaged or fails to arrive within 10 business days of shipment, contact us at <a href="mailto:sales@tierone.bio" style={{ color: "var(--red-primary)" }}>sales@tierone.bio</a> with your order number. We will work with the carrier to resolve the issue.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function ReturnsPage() {
  useRouteMeta("/returns");
  return (
    <>
      <PolicyShell kicker="POLICY" title="Returns & Refunds">
        <p>Because every product we sell is a research-use-only laboratory compound, returns are accepted only in specific circumstances described below. By placing an order, you confirm that you are a qualified researcher purchasing for laboratory use only.</p>

        <h2 style={policyHeadingStyle}>Eligible Returns</h2>
        <p>We will replace or refund any product that:</p>
        <ul style={{ paddingLeft: 24 }}>
          <li>Arrives damaged or with broken seals</li>
          <li>Was shipped incorrectly (wrong product, wrong dose)</li>
          <li>Fails to arrive within 10 business days of the ship date</li>
        </ul>

        <h2 style={policyHeadingStyle}>Non-Returnable Items</h2>
        <p>Once a product has been opened, reconstituted, used, or otherwise altered, it cannot be returned. Change-of-mind returns are not accepted on lyophilized research compounds due to chain-of-custody and lot-integrity requirements.</p>

        <h2 style={policyHeadingStyle}>How to Request a Return</h2>
        <p>Contact <a href="mailto:sales@tierone.bio" style={{ color: "var(--red-primary)" }}>sales@tierone.bio</a> within 7 days of delivery with your order number, a description of the issue, and photos if applicable. We will respond within 1 business day with next steps.</p>

        <h2 style={policyHeadingStyle}>Refund Method</h2>
        <p>Approved refunds are issued via the original payment method (Cash App or Venmo) within 3 business days of resolution.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function TermsPage() {
  useRouteMeta("/terms");
  return (
    <>
      <PolicyShell kicker="LEGAL" title="Terms of Service">
        <p>By accessing or purchasing from Tier One BioSystems, you agree to the following terms.</p>

        <h2 style={policyHeadingStyle}>Eligibility</h2>
        <p>You must be at least 18 years of age and a qualified researcher, laboratory professional, or scientific institution. Products are not for human or animal consumption and are sold solely for in-vitro laboratory research use.</p>

        <h2 style={policyHeadingStyle}>Product Use</h2>
        <p>All products are research-use-only (RUO) chemicals. They are not drugs, foods, cosmetics, or dietary supplements. They have not been evaluated by the FDA. They are not intended to diagnose, treat, cure, or prevent any disease in humans or animals.</p>

        <h2 style={policyHeadingStyle}>Customer Responsibility</h2>
        <p>You are solely responsible for handling, storing, and using research compounds in accordance with applicable federal, state, and local laws and accepted laboratory safety protocols. Tier One BioSystems is not responsible for any misuse, off-label use, or violation of applicable regulations by the purchaser.</p>

        <h2 style={policyHeadingStyle}>Pricing & Availability</h2>
        <p>Prices are subject to change without notice. Inventory is subject to availability. We reserve the right to refuse, cancel, or limit orders at our sole discretion.</p>

        <h2 style={policyHeadingStyle}>Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, Tier One BioSystems' liability for any claim arising from the sale or use of our products is limited to the amount paid for the product in question.</p>

        <h2 style={policyHeadingStyle}>Governing Law</h2>
        <p>These terms are governed by the laws of the State of Arizona, USA.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function PrivacyPage() {
  useRouteMeta("/privacy");
  return (
    <>
      <PolicyShell kicker="LEGAL" title="Privacy Policy">
        <p>Tier One BioSystems respects your privacy. This policy describes what information we collect and how we use it.</p>

        <h2 style={policyHeadingStyle}>Information We Collect</h2>
        <p>When you place an order, we collect the following information: name, email, phone number, shipping address, items ordered, and order total. This information is used solely to fulfill your order and communicate with you about it.</p>

        <h2 style={policyHeadingStyle}>How We Use Your Information</h2>
        <ul style={{ paddingLeft: 24 }}>
          <li>To process and ship your order</li>
          <li>To send order confirmations and shipping notifications</li>
          <li>To respond to support inquiries</li>
          <li>To comply with legal obligations</li>
        </ul>

        <h2 style={policyHeadingStyle}>Information Sharing</h2>
        <p>We do not sell, trade, or rent your personal information to third parties. We share information only with service providers required to fulfill your order (shipping carriers, email service, payment platforms) and only the information necessary for that purpose.</p>

        <h2 style={policyHeadingStyle}>Cookies & Analytics</h2>
        <p>We use Google Analytics to understand site traffic. This service may set cookies. We use localStorage in your browser to remember your cart between visits. You can clear this at any time through your browser settings.</p>

        <h2 style={policyHeadingStyle}>Data Security</h2>
        <p>Order data is transmitted over HTTPS and stored on secure third-party services (Netlify Forms, EmailJS). Payments occur outside our site through Cash App or Venmo and we never see or store payment credentials.</p>

        <h2 style={policyHeadingStyle}>Contact</h2>
        <p>For privacy questions or data deletion requests, contact <a href="mailto:sales@tierone.bio" style={{ color: "var(--red-primary)" }}>sales@tierone.bio</a>.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function AboutPage() {
  useRouteMeta("/about");
  return (
    <>
      <PolicyShell kicker="WHO WE ARE" title="About Tier One">
        <p>Tier One BioSystems was built around a simple idea: research peptide buyers deserve total transparency. Every product we sell is documented at the lot level — purity, peptide content, mass confirmation, and sterility — so qualified researchers can make sourcing decisions with confidence.</p>

        <h2 style={policyHeadingStyle}>What We Do</h2>
        <p>We supply research-use-only peptides and compounds for laboratory use. Our catalog focuses on the most commonly studied compounds in academic and independent research settings, sourced from US and verified international synthesis partners.</p>

        <h2 style={policyHeadingStyle}>How We're Different</h2>
        <ul style={{ paddingLeft: 24 }}>
          <li><strong style={{ color: "var(--text-primary)" }}>Lot-level COAs.</strong> Every batch is tested by independent labs, and the results are published on this site before you order.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>99%+ purity standard.</strong> Released lots meet or exceed 99% purity by RP-HPLC.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>US-based fulfillment.</strong> Orders ship from Phoenix, Arizona — no overseas waiting.</li>
          <li><strong style={{ color: "var(--text-primary)" }}>Direct support.</strong> Questions go straight to a real person, not a ticket queue.</li>
        </ul>

        <h2 style={policyHeadingStyle}>Research Use Only</h2>
        <p>All products are sold for in-vitro laboratory research use only. They are not drugs, supplements, or food, and they are not intended for human or animal consumption. By purchasing, you acknowledge that you are a qualified researcher and accept responsibility for proper handling and use.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function FAQPage() {
  useRouteMeta("/faq");
  const [openIdx, setOpenIdx] = useState(null);
  const items = [
    { q: "Are your products for human use?", a: "No. All Tier One BioSystems products are sold strictly for in-vitro laboratory research use only. They are not drugs, supplements, food, or cosmetics. They are not intended for human or animal consumption." },
    { q: "What is your purity standard?", a: "Released lots meet or exceed 99% purity by reverse-phase HPLC. Each lot is tested for appearance, purity, peptide content, mass confirmation (ESI-MS or MALDI-TOF), water content, residual solvents, and bacterial endotoxins. Results are published on the Lab Results page." },
    { q: "How do I view a Certificate of Analysis (COA)?", a: "Every product page has a green VIEW CERTIFICATE OF ANALYSIS button. Clicking it opens that product's most recent lot data with all test results, methods, specifications, and pass/fail status." },
    { q: "How long does shipping take?", a: "Orders paid before 2:00 PM Arizona time ship the same business day from Phoenix, AZ via UPS or FedEx. Standard ground delivery within the continental US is typically 2–5 business days." },
    { q: "Do you offer free shipping?", a: "Yes. Orders of $200 or more (after any discounts applied) ship free. Orders under $200 are charged a flat $10 shipping fee." },
    { q: "What payment methods do you accept?", a: "Currently Cash App ($TierOneBio) and Venmo (@TierOneBio). At checkout you'll select your preferred method and follow the on-screen instructions to complete payment." },
    { q: "Why don't you accept credit cards?", a: "Most major card processors restrict research peptide sales due to category-level policy. Cash App and Venmo allow us to keep the catalog accessible and prices low without surprise account terminations or held funds." },
    { q: "How should I store the products?", a: "Lyophilized vials should be stored in a laboratory freezer (0°F / -18°C) for long-term storage. Once reconstituted with bacteriostatic water, store refrigerated (35–46°F / 2–8°C) and use within the storage window listed on the product page." },
    { q: "Do you offer bulk discounts?", a: "Yes. Each product has a discounted per-vial price when you order 5 or more of the same compound and dose. The bulk price is shown on every product card and product page." },
    { q: "Do you ship internationally?", a: "Not at this time. We currently ship to the United States only." },
    { q: "What if my order arrives damaged?", a: "Contact us at sales@tierone.bio within 7 days of delivery with your order number and photos. We will replace or refund eligible damaged shipments." },
    { q: "How do I reach customer support?", a: "Email sales@tierone.bio or use the Contact form. Most replies arrive within one business day." },
  ];

  return (
    <>
      <div style={{ maxWidth: 850, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.2em",
            color: "var(--red-primary)",
            marginBottom: 10,
          }}>HELP CENTER</div>
          <h1 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: "clamp(24px, 5vw, 36px)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}>Frequently Asked Questions</h1>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={i} style={{
                border: isOpen ? "1px solid rgba(196,30,42,0.4)" : "1px solid var(--border)",
                background: "var(--bg-card)",
                transition: "all 0.3s ease",
              }}>
                <div onClick={() => setOpenIdx(isOpen ? null : i)} style={{
                  padding: "18px 24px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontWeight: 600,
                    fontSize: 17,
                    color: "var(--text-primary)",
                  }}>{item.q}</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 20,
                    color: "var(--text-secondary)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.3s",
                    flexShrink: 0,
                  }}>&#9660;</span>
                </div>
                {isOpen && (
                  <div style={{
                    padding: "0 24px 22px",
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 16,
                    color: "var(--text-secondary)",
                    lineHeight: 1.7,
                    animation: "fadeIn 0.25s ease-out",
                  }}>{item.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Footer />
    </>
  );
}

function TestingStandardsPage() {
  useRouteMeta("/testing-standards");
  const navigate = useNavigate();
  return (
    <>
      <PolicyShell kicker="QUALITY ASSURANCE" title="Testing Standards">
        <p>Every lot Tier One BioSystems releases is independently tested against a defined acceptance specification. Below is what we test, why we test it, and the methods used. The current Certificate of Analysis for each product is published on the <a href="/lab-results" onClick={(e) => { e.preventDefault(); navigate("/lab-results"); }} style={{ color: "var(--red-primary)", cursor: "pointer" }}>Lab Results</a> page.</p>

        <h2 style={policyHeadingStyle}>Appearance</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Visual.</strong> Lyophilized peptides are inspected for color, form, and visible particulates. Released lots are clean white-to-off-white powders unless otherwise noted (GHK-Cu, for example, is naturally blue).</p>

        <h2 style={policyHeadingStyle}>Purity (RP-HPLC)</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Reverse-phase High-Performance Liquid Chromatography.</strong> The gold-standard purity test for synthetic peptides. RP-HPLC separates a peptide from its synthesis byproducts and measures the proportion of target peptide. Tier One spec: <strong>≥ 99.0%</strong>.</p>

        <h2 style={policyHeadingStyle}>Mass Confirmation (ESI-MS / MALDI-TOF)</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Mass spectrometry.</strong> Confirms that the molecular weight of the synthesized peptide matches the theoretical molecular weight of the target sequence. This catches truncations, deletions, and modifications that purity alone might not flag.</p>

        <h2 style={policyHeadingStyle}>Amino Acid Analysis (AAA)</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Hydrolysis followed by quantitation.</strong> Verifies that the amino acid composition of the peptide matches the expected sequence. A second-line confirmation of identity.</p>

        <h2 style={policyHeadingStyle}>Peptide Content</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Nitrogen analysis.</strong> Measures how much of the lyophilized powder is actual peptide vs. trapped water, salts, and counter-ions. Tier One spec: <strong>≥ 80%</strong>. Higher peptide content means a more concentrated product per labeled mass.</p>

        <h2 style={policyHeadingStyle}>Labeled vs. Actual Peptide Content</h2>
        <p>We also publish the actual measured peptide content per vial alongside the labeled amount. Real-world lots are rarely exactly the labeled mass; we target slight overfill so researchers receive at least the labeled amount, never less.</p>

        <h2 style={policyHeadingStyle}>Water Content</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Karl Fischer titration.</strong> Excess water reduces stability and active peptide content. Tier One spec: <strong>≤ 8.0%</strong>.</p>

        <h2 style={policyHeadingStyle}>Bacterial Endotoxins</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Limulus Amebocyte Lysate (LAL).</strong> Detects bacterial-derived contaminants. Tier One spec: <strong>&lt; 5 EU/mg</strong> (well below USP injectable thresholds for human use, even though our products are not for human use).</p>

        <h2 style={policyHeadingStyle}>Residual Solvents</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Gas Chromatography Headspace (GC-HS).</strong> Confirms that residual synthesis solvents (TFA, acetonitrile, etc.) are within USP &lt;467&gt; limits.</p>

        <h2 style={policyHeadingStyle}>Acetate Content</h2>
        <p><strong style={{ color: "var(--text-primary)" }}>Method: Ion Chromatography.</strong> Many peptides are isolated as acetate salts. We measure the acetate fraction so that peptide content calculations remain accurate. Spec: <strong>≤ 15.0%</strong>.</p>

        <h2 style={policyHeadingStyle}>Lot Release</h2>
        <p>A lot is released for sale only when every test in the specification passes. Lots that fail any criterion are rejected and never sold. The COA shown on the Lab Results page reflects the current released lot for each product.</p>
      </PolicyShell>
      <Footer />
    </>
  );
}

function ResearchPage() {
  useRouteMeta("/research");
  const navigate = useNavigate();
  const isMobile = window.innerWidth < 700;
  const sorted = publishedArticles().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "120px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", color: "var(--red-primary)", marginBottom: 10 }}>RESEARCH</div>
          <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: "clamp(24px, 5vw, 36px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 14 }}>Peptide Research & Education</h1>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 17, color: "var(--text-secondary)", maxWidth: 680, margin: "0 auto", lineHeight: 1.7 }}>Evidence-based reviews of peptide mechanisms, research applications, and the peer-reviewed literature behind the compounds in our catalog.</p>
        </div>

        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", fontFamily: "'Rajdhani', sans-serif", color: "var(--text-dim)" }}>No articles yet. Check back soon.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {sorted.map(article => (
              <a key={article.slug} href={`/research/${article.slug}`} onClick={(e) => { e.preventDefault(); navigate(`/research/${article.slug}`); }} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                <article style={{ border: "1px solid var(--border)", background: "var(--bg-card)", overflow: "hidden", transition: "all 0.2s", height: "100%", display: "flex", flexDirection: "column" }} onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(196,30,42,0.4)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                  {article.heroImage && (
                    <div style={{ height: 180, background: "#080808", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <img src={article.heroImage} alt={article.title} loading="lazy" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    </div>
                  )}
                  <div style={{ padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      {(article.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", padding: "3px 8px", border: "1px solid rgba(196,30,42,0.3)", color: "var(--red-primary)", textTransform: "uppercase" }}>{tag}</span>
                      ))}
                    </div>
                    <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "0.02em", lineHeight: 1.25, marginBottom: 10, color: "var(--text-primary)" }}>{article.title}</h2>
                    <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 500, color: "var(--text-secondary)", lineHeight: 1.65, marginBottom: 16, flex: 1 }}>{article.excerpt}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      <span>{formatArticleDate(article.date)}</span>
                      <span>{article.readingTimeMinutes} min read</span>
                    </div>
                  </div>
                </article>
              </a>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}

function ArticlePage() {
  const { slug } = useParams();
  const article = getArticleBySlug(slug);
  const navigate = useNavigate();
  // articleMeta() is the same helper the prerenderer uses, so the served HTML
  // and the hydrated page always agree on this article's title.
  const meta = article ? articleMeta(article) : null;
  usePageMeta(
    meta ? meta.title : "Article Not Found",
    meta ? meta.description : "",
    { image: meta?.image, type: "article", noindex: !article }
  );
  // Same graph the prerenderer bakes into this page's HTML, plus the breadcrumb
  // trail that was missing before.
  useEffect(() => {
    if (!article) return undefined;
    return applyRouteJsonLd(articleGraph(article));
  }, [article]);
  if (!article) return <NotFoundPage />;
  const isMobile = window.innerWidth < 700;
  const related = (article.relatedProductIds || []).map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  return (
    <>
      <article style={{ maxWidth: 760, margin: "0 auto", padding: "110px 24px 80px" }}>
        <div style={{ marginBottom: 24, fontFamily: "'Rajdhani', sans-serif", fontSize: 13 }}>
          <a href="/research" onClick={(e) => { e.preventDefault(); navigate("/research"); }} style={{ color: "var(--red-primary)", textDecoration: "none" }}>← All research articles</a>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {(article.tags || []).map(tag => (
            <span key={tag} style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", padding: "4px 10px", border: "1px solid rgba(196,30,42,0.3)", color: "var(--red-primary)", textTransform: "uppercase" }}>{tag}</span>
          ))}
        </div>

        <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: "clamp(26px, 5vw, 38px)", letterSpacing: "0.02em", lineHeight: 1.15, marginBottom: 16, color: "var(--text-primary)" }}>{article.title}</h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}>
          <span>{article.author || "Tier One Research Team"}</span>
          <span>·</span>
          <span>{formatArticleDate(article.date)}</span>
          <span>·</span>
          <span>{article.readingTimeMinutes} min read</span>
        </div>

        {article.heroImage && (
          <div style={{ height: isMobile ? 240 : 320, background: "#080808", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 36, border: "1px solid var(--border)" }}>
            <img src={article.heroImage} alt={article.title} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 16 }} />
          </div>
        )}

        <div className="article-body" style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 17, lineHeight: 1.8, color: "var(--text-secondary)" }}>
          <Suspense fallback={<p style={{ color: "var(--text-dim)" }}>Loading article…</p>}>
            <ArticleBody slug={article.slug} />
          </Suspense>
        </div>

        {citableReferences(article.references).length > 0 && (
          <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "var(--red-primary)", textTransform: "uppercase", marginBottom: 6 }}>Peer-reviewed research</div>
            <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.02em", color: "var(--text-primary)", marginBottom: 18 }}>References</h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {citableReferences(article.references).map((ref, i) => (
                <a key={i} href={ref.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "16px 18px", border: "1px solid var(--border)", background: "rgba(17,17,17,0.5)", textDecoration: "none", transition: "all 0.2s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(196,30,42,0.4)"; e.currentTarget.style.background = "rgba(196,30,42,0.04)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(17,17,17,0.5)"; }}>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--red-primary)", marginBottom: 8, textTransform: "uppercase" }}>{ref.journal}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.35, marginBottom: 8 }}>{ref.title}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", marginBottom: ref.authors ? 6 : 10 }}>{ref.year ? `${ref.year} · ` : ""}{ref.identifier}</div>
                  {ref.authors && <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontStyle: "italic", color: "var(--text-secondary)", marginBottom: 10 }}>{ref.authors}</div>}
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--red-primary)" }}>View Source ↗</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "var(--red-primary)", textTransform: "uppercase", marginBottom: 6 }}>From our catalog</div>
            <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.02em", color: "var(--text-primary)", marginBottom: 18 }}>Related Products</h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {related.map(p => (
                <a key={p.id} href={`/product/${p.id}`} onClick={(e) => { e.preventDefault(); navigate(`/product/${p.id}`); }} style={{ display: "block", textDecoration: "none", border: "1px solid var(--border)", background: "var(--bg-card)", padding: 16, transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(196,30,42,0.4)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
                  <div style={{ height: 110, display: "flex", alignItems: "center", justifyContent: "center", background: "#080808", marginBottom: 12 }}>
                    <img src={p.image} alt={p.name} loading="lazy" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 6 }} />
                  </div>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>{p.dose}</div>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>${p.price}<span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 500, fontSize: 13, color: "var(--text-dim)" }}> /vial</span></div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 48, padding: "20px 22px", border: "1px solid rgba(196,30,42,0.15)", background: "rgba(196,30,42,0.03)" }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", color: "var(--red-primary)", marginBottom: 6, textTransform: "uppercase" }}>Research Use Only</div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>This content is for educational and research purposes. Tier One BioSystems products are sold for laboratory research use only. Not for human consumption. Not a drug, food, or cosmetic.</div>
        </div>
      </article>
      <Footer />
    </>
  );
}

function formatArticleDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function AgeGate({ onConfirm }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="age-verification-title" style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "rgba(0,0,0,0.68)",
      backdropFilter: "blur(7px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        maxWidth: 460,
        width: "100%",
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        background: "rgba(17,19,22,0.98)",
        border: "1px solid rgba(217,54,66,0.38)",
        boxShadow: "0 28px 80px rgba(0,0,0,0.62)",
        padding: "30px 30px 28px",
        textAlign: "center",
        animation: "fadeIn 0.4s ease-out",
      }}>
        {/* Logo */}
        <img
          src="/logo_transparent.png"
          alt="Tier One BioSystems"
          style={{
            height: 90,
            width: "auto",
            marginBottom: 16,
          }}
        />

        {/* Divider */}
        <div style={{
          height: 1,
          background: "linear-gradient(to right, transparent, rgba(196,30,42,0.3), transparent)",
          marginBottom: 20,
        }} />

        {/* Age verification */}
        <h2 id="age-verification-title" style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: "0.05em",
          marginBottom: 10,
          color: "var(--text-primary)",
        }}>AGE VERIFICATION</h2>

        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          fontWeight: 500,
          color: "var(--text-secondary)",
          lineHeight: 1.55,
          marginBottom: 18,
        }}>
          You must be <span style={{ color: "var(--red-primary)", fontWeight: 700 }}>18 years or older</span> to
          access this website.
        </p>

        {/* Disclaimer box */}
        <div style={{
          padding: "14px 16px",
          border: "1px solid rgba(217,54,66,0.2)",
          background: "rgba(217,54,66,0.045)",
          marginBottom: 22,
          textAlign: "left",
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--red-primary)",
            marginBottom: 8,
          }}>RESEARCH USE ONLY</div>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
            margin: 0,
          }}>
            All products sold on this website are intended strictly for laboratory and
            research purposes only. They are not intended for human consumption and are
            not to be used as drugs, food, or cosmetics. By entering this site, you
            acknowledge that you are a qualified researcher or laboratory professional
            and agree to handle all products in accordance with applicable regulations
            and safety protocols.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => onConfirm(true)}
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.15em",
              padding: "12px 20px",
              background: "var(--red-primary)",
              border: "1px solid var(--red-primary)",
              color: "#fff",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.2s",
              flex: 1,
              minWidth: 160,
            }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >I AM 18 OR OLDER</button>
          <button
            onClick={() => onConfirm(false)}
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.15em",
              padding: "12px 20px",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.2s",
              flex: 1,
              minWidth: 160,
            }}
          >I AM UNDER 18</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

// ─── Routed Page Components ───────────────────────────────────────────────────
const FEATURED_IDS = ["glp3rt-10", "tesamorelin", "bpc157-10", "tb500", "klow", "motsc"];

function HomePage({ onAddToCart, onSelectProduct, ageVerified }) {
  const navigate = useNavigate();
  const featuredProducts = FEATURED_IDS.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  useRouteMeta("/");
  useScrollReveal();
  return (<>
    <Hero statsActive={ageVerified} />

    {/* Featured Products */}
    <section className="scroll-reveal" style={{ maxWidth: 1400, margin: "0 auto", padding: "44px 24px 60px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>BEST SELLERS</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 28,
          letterSpacing: "0.05em",
        }}>FEATURED COMPOUNDS</h2>
      </div>

      <div className="featured-grid" style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 45%), 1fr))",
        gap: 20,
      }}>
        {featuredProducts.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            index={i}
            onClick={() => onSelectProduct(product)}
            onAddToCart={onAddToCart}
          />
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 48 }}>
        <button onClick={() => navigate("/products")} style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.15em",
          padding: "16px 48px",
          background: "transparent",
          border: "1px solid var(--red-primary)",
          color: "var(--red-primary)",
          cursor: "pointer",
          textTransform: "uppercase",
          transition: "all 0.2s",
        }}
          onMouseEnter={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
        >VIEW ALL PRODUCTS</button>
      </div>
    </section>

    <Footer />
  </>);
};

// Full Products Page
function ProductsPage({ searchQuery, setSearchQuery, onAddToCart, onSelectProduct }) {
  const filtered = PRODUCTS.filter(p => searchQuery === "" || p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  useRouteMeta("/products");
  useScrollReveal();
  return (<>
    <section style={{ maxWidth: 1400, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.2em",
          color: "var(--red-primary)",
          marginBottom: 10,
        }}>CATALOG</div>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 28,
          letterSpacing: "0.05em",
        }}>ALL RESEARCH COMPOUNDS</h2>
      </div>

      {/* Search bar */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        marginBottom: 32,
      }}>
        <input
          type="text"
          placeholder="Search compounds..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "10px 18px",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            outline: "none",
            letterSpacing: "0.05em",
            transition: "border-color 0.2s",
          }}
          onFocus={e => e.target.style.borderColor = "rgba(196,30,42,0.4)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"}
        />
      </div>

      {/* Product grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 45%), 1fr))",
        gap: 20,
      }}>
        {filtered.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            index={i}
            onClick={() => onSelectProduct(product)}
            onAddToCart={onAddToCart}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 16,
          color: "var(--text-dim)",
        }}>No compounds found matching your search.</div>
      )}
    </section>
    <Footer />
  </>);
};

// Individual Product Page
function ProductPage({ onAddToCart }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const product = PRODUCTS.find(p => p.id === id);
  // productMeta() is the same helper the prerenderer uses.
  const meta = product ? productMeta(product) : null;
  usePageMeta(
    meta ? meta.title : "Product Not Found",
    meta ? meta.description : "",
    { image: meta?.image, noindex: !product }
  );
  // Product schema for crawlers that DO run JavaScript. The prerendered HTML
  // already carries the identical graph (both come from productGraph), so this
  // replaces rather than duplicates it. Declared before the early return below
  // — every hook in this file must run before any `if (...) return`.
  useEffect(() => {
    if (!product) return undefined;
    return applyRouteJsonLd(productGraph(product));
  }, [product]);
  const isMobile = window.innerWidth < 700;
  if (!product) return <NotFoundPage />;
  return (<>
    <section style={{ maxWidth: 1000, margin: "0 auto", padding: "120px 24px 80px" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 0,
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
        marginBottom: 32,
      }}>
        {/* Image */}
        <div style={{
          background: "#080808",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          maxHeight: isMobile ? 300 : 450,
        }}>
          <img src={product.image} alt={product.name} loading="lazy" style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            padding: isMobile ? 10 : 20,
          }} />
        </div>

        {/* Info */}
        <div style={{ padding: isMobile ? "20px 18px" : "40px 36px", display: "flex", flexDirection: "column" }}>
          <h1 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: isMobile ? 24 : 32,
            letterSpacing: "0.03em",
            lineHeight: 1.1,
            marginBottom: 4,
          }}>{product.name}</h1>

          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 18,
            fontWeight: 500,
            color: "var(--text-secondary)",
            marginBottom: 24,
          }}>{product.dose}</div>

          {/* Price block */}
          <div style={{
            padding: "16px 20px",
            border: "1px solid var(--border)",
            background: "rgba(196,30,42,0.03)",
            marginBottom: 24,
          }}>
            {isSaleActive() ? (<>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, letterSpacing: "0.18em", fontWeight: 700, color: "var(--red-primary)", marginBottom: 6, textTransform: "uppercase" }}>{SITEWIDE_SALE.headline}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 28, color: "var(--text-primary)" }}>${applySale(product.price)}</span>
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--text-secondary)" }}>/vial</span>
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--text-dim)", textDecoration: "line-through" }}>${product.price}</span>
              </div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--red-primary)", fontWeight: 700 }}>5+ Vials: ${applySale(product.bulk)} each <span style={{ color: "var(--text-dim)", fontWeight: 400, textDecoration: "line-through", fontSize: 15, marginLeft: 8 }}>${product.bulk}</span></div>
            </>) : (<>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 28 }}>${product.price}</span>
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--text-secondary)" }}>/vial</span>
              </div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--red-primary)", fontWeight: 700 }}>5+ Vials: ${product.bulk} each</div>
            </>)}
            <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>10+ extra 5% off · 25+ extra 10% off</div>
          </div>

          <button onClick={() => onAddToCart(product)} style={{
            width: "100%",
            padding: "14px 0",
            background: "var(--red-primary)",
            border: "1px solid var(--red-primary)",
            color: "#fff",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
            marginBottom: 20,
          }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >ADD TO CART</button>

          {/* Trust bar */}
          <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 20,
          }}>
            {[
              { label: "LOT-TESTED", color: "#22c55e" },
              { label: "SHIPS FROM US", color: "var(--red-primary)" },
              { label: "FREE OVER $200", color: "#22c55e" },
            ].map((b, i) => (
              <span key={i} style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                padding: "5px 10px",
                border: `1px solid ${b.color === "#22c55e" ? "rgba(34,197,94,0.3)" : "rgba(196,30,42,0.4)"}`,
                background: b.color === "#22c55e" ? "rgba(34,197,94,0.05)" : "rgba(196,30,42,0.05)",
                color: b.color,
              }}>{b.label}</span>
            ))}
          </div>

          {/* Quick specs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "PURITY", value: product.purity },
              { label: "FORM", value: "Lyophilized" },
            ].map((spec, i) => (
              <div key={i} style={{ padding: "10px 14px", border: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", marginBottom: 4 }}>{spec.label}</div>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{spec.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Research info */}
      <div style={{ border: "1px solid var(--border)", background: "var(--bg-card)", padding: isMobile ? "24px 18px" : "36px 40px", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", color: "var(--red-primary)", marginBottom: 16 }}>RESEARCH PROFILE</div>
        <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 17, fontWeight: 400, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28 }}>{product.research}</p>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          {[
            { label: "SEQUENCE / COMPOSITION", value: product.sequence },
            { label: "STORAGE CONDITIONS", value: product.storage },
          ].map((item, i) => (
            <div key={i} style={{ padding: "16px 20px", border: "1px solid var(--border)", background: "rgba(17,17,17,0.5)" }}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 500, color: "var(--text-secondary)", lineHeight: 1.6 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* View COA button */}
        {getLabResults(product.name, product.dose) && (
          <button onClick={() => navigate(`/lab-results?product=${encodeURIComponent(product.name)}&dose=${encodeURIComponent(product.dose)}`)} style={{
            marginTop: 28,
            width: "100%",
            padding: "12px 0",
            background: "transparent",
            border: "1px solid rgba(34,197,94,0.3)",
            color: "#22c55e",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.target.style.background = "rgba(34,197,94,0.1)"; }}
            onMouseLeave={e => { e.target.style.background = "transparent"; }}
          >VIEW CERTIFICATE OF ANALYSIS</button>
        )}

        {/* Say why there is no report here, rather than leaving a silent gap
            where every other product shows one. */}
        {isLabResultWithheld(product.name, product.dose) && (
          <div style={{
            marginTop: 28,
            padding: "14px 16px",
            border: "1px solid rgba(196,30,42,0.25)",
            background: "rgba(196,30,42,0.04)",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 15,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}>
            The analytical summary on file for this compound records a different vial quantity
            than this listing, so we are withholding it until the original report has been
            re-checked. Request the signed report for a specific lot at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--red-primary)" }}>{CONTACT_EMAIL}</a>.
          </div>
        )}
      </div>

      {/* Molecular Profile */}
      {getMolecularProfile(product.name) && (
        <div style={{ marginBottom: 24 }}>
          <MolecularProfile product={product} />
        </div>
      )}

      {/* Sources & References */}
      {getReferences(product.name) && (
        <div style={{
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          padding: isMobile ? "24px 18px" : "32px 36px",
          marginBottom: 24,
        }}>
          <SourcesReferences product={product} />
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ padding: "14px 18px", border: "1px solid rgba(196,30,42,0.15)", background: "rgba(196,30,42,0.03)" }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "var(--red-primary)", marginBottom: 6 }}>RESEARCH USE ONLY</div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          This product is intended for laboratory research use only. Not for human consumption. Not a drug, food, or cosmetic. Handle with appropriate laboratory safety protocols.
        </div>
      </div>
    </section>
    <Footer />
  </>);
};

export default function App() {
  const [ageVerified, setAgeVerified] = useState(() => {
    try { return sessionStorage.getItem("ageVerified") === "true"; }
    catch { return false; }
  });
  const [ageDenied, setAgeDenied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const navigate = useNavigate();
  // Everything in localStorage is customer-editable, so the stored cart is
  // treated as untrusted input and every line is rebuilt from the catalog.
  const [cart, setCart] = useState(() => readStoredCart(localStorage));
  useEffect(() => {
    try { localStorage.setItem("t1b-cart", JSON.stringify(cart)); }
    catch { /* Storage can be full or blocked; the in-memory cart still works. */ }
  }, [cart]);
  const [cartPopupVisible, setCartPopupVisible] = useState(false);
  const cartPopupTimer = useRef(null);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);
  useEffect(() => () => { if (cartPopupTimer.current) clearTimeout(cartPopupTimer.current); }, []);

  // A dead confirmation link (expired or already used) still redirects here, to
  // the Site URL, with the reason in the URL fragment. Without this the customer
  // just lands on the homepage looking successful, then can't log in and has no
  // idea why. Catch it, clear the fragment, and hand it to the login page.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("error")) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const code = params.get("error_code") || params.get("error");
    if (!code) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    navigate(`/login?auth_error=${encodeURIComponent(code)}`, { replace: true });
  }, [navigate]);

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: clampQuantity(item.qty + 1) } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    setCartPopupVisible(true);
    if (cartPopupTimer.current) clearTimeout(cartPopupTimer.current);
    cartPopupTimer.current = setTimeout(() => setCartPopupVisible(false), 4000);
  }

  // The global "every product on every page" JSON-LD that used to live here has
  // been removed. It put all 27 Product entities on the cart, the login page and
  // every article — structured data is supposed to describe the page it is on,
  // and describing 27 products on a page showing none of them describes nothing.
  // Product schema is now emitted per product page (see ProductPage), and baked
  // into the prerendered HTML so it does not depend on JavaScript running.

  // Age denied screen
  if (ageDenied) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}>
        <div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 800,
            fontSize: 24,
            marginBottom: 16,
            color: "var(--red-primary)",
          }}>ACCESS DENIED</h2>
          <p style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 17,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}>You must be 18 years or older to access this website.</p>
        </div>
      </div>
    );
  }

  // The age gate is an overlay ON TOP of the site, not a replacement for it.
  //
  // It used to `return <AgeGate />` instead of the app, which meant the page
  // contained nothing but the gate until someone clicked a button. Crawlers do
  // not click buttons, so every URL on the site rendered as a single modal with
  // no content, no headings and no links — the gate was quietly acting as a
  // sitewide noindex.
  //
  // Rendering the site underneath and covering it with a modal keeps the
  // verification step intact for people while leaving the page itself readable.
  // `inert` blocks interaction and removes the content beneath from the tab
  // order, so the gate is not bypassable by keyboard while it is up.
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {!ageVerified && (
        <AgeGate onConfirm={(isOldEnough) => {
          if (isOldEnough) {
            try { sessionStorage.setItem("ageVerified", "true"); }
            catch { /* Session storage can be blocked; the gate simply reappears. */ }
            setAgeVerified(true);
          } else {
            setAgeDenied(true);
          }
        }} />
      )}
      <div inert={!ageVerified ? true : undefined}>
      <Header cartCount={cart.reduce((sum, i) => sum + i.qty, 0)} />
      <CartPopup cart={cart} visible={cartPopupVisible} onClose={() => setCartPopupVisible(false)} />
      {selectedProduct && (
        <ProductQuickView
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
          onViewDetails={(product) => navigate(`/product/${product.id}`)}
        />
      )}
      <Routes>
        <Route path="/" element={<HomePage onAddToCart={addToCart} onSelectProduct={setSelectedProduct} ageVerified={ageVerified} />} />
        <Route path="/products" element={<ProductsPage searchQuery={searchQuery} setSearchQuery={setSearchQuery} onAddToCart={addToCart} onSelectProduct={setSelectedProduct} />} />
        <Route path="/product/:id" element={<ProductPage onAddToCart={addToCart} />} />
        <Route path="/calculator" element={<PeptideCalculator />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/research/:slug" element={<ArticlePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/lab-results" element={<LabResultsPage />} />
        <Route path="/cart" element={<CartPage cart={cart} setCart={setCart} />} />
        <Route path="/checkout" element={<Navigate to="/cart" replace />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/signup" element={<AuthPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/testing-standards" element={<TestingStandardsPage />} />
        <Route path="/shipping" element={<ShippingPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </div>
    </div>
  );
}
