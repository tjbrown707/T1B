import { useState, useEffect, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import emailjs from "@emailjs/browser";

// ─── Data ────────────────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: "glp3rt-5",
    name: "GLP-3RT",
    dose: "5 mg",
    price: 55,
    bulk: 50,
    image: "/glp3rt-5.jpg",
    category: "Weight Management",
    research: "GLP-3RT is a research compound targeting the GLP-1 receptor pathway. Preclinical studies suggest it may influence glucose metabolism, appetite signaling, and energy homeostasis. Researchers have observed its potential role in modulating incretin hormone activity, which plays a key role in metabolic regulation. Studies in animal models have demonstrated dose-dependent effects on food intake and body composition parameters.",
    sequence: "Modified GLP-1 receptor targeting peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "glp3rt-10",
    name: "GLP-3RT",
    dose: "10 mg",
    price: 85,
    bulk: 80,
    image: "/glp3rt-10.jpg",
    category: "Weight Management",
    research: "GLP-3RT is a research compound targeting the GLP-1 receptor pathway. Preclinical studies suggest it may influence glucose metabolism, appetite signaling, and energy homeostasis. Researchers have observed its potential role in modulating incretin hormone activity, which plays a key role in metabolic regulation. Studies in animal models have demonstrated dose-dependent effects on food intake and body composition parameters.",
    sequence: "Modified GLP-1 receptor targeting peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "glp3rt-30",
    name: "GLP-3RT",
    dose: "30 mg",
    price: 185,
    bulk: 165,
    image: "/glp3rt-30.jpg",
    category: "Weight Management",
    research: "GLP-3RT is a research compound targeting the GLP-1 receptor pathway. Preclinical studies suggest it may influence glucose metabolism, appetite signaling, and energy homeostasis. Researchers have observed its potential role in modulating incretin hormone activity, which plays a key role in metabolic regulation. Studies in animal models have demonstrated dose-dependent effects on food intake and body composition parameters.",
    sequence: "Modified GLP-1 receptor targeting peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "tesamorelin",
    name: "Tesamorelin",
    dose: "10 mg",
    price: 75,
    bulk: 70,
    image: "/tesamorelin.jpg",
    category: "Growth Hormone",
    research: "Tesamorelin is a synthetic analog of growth hormone-releasing hormone (GHRH). Research indicates it stimulates the pituitary gland to produce growth hormone in a pulsatile, physiological manner. Published studies have examined its effects on visceral adipose tissue reduction and lipid metabolism. It has been the subject of clinical research for its impact on body composition in various metabolic conditions.",
    sequence: "Modified GHRH (1-44) amide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 3 weeks.",
    purity: "99%+",
  },
  {
    id: "cjc-ipa",
    name: "CJC-1295 / Ipamorelin",
    dose: "5/5 mg",
    price: 75,
    bulk: 65,
    image: "/cjc-ipa.jpg",
    category: "Growth Hormone",
    research: "CJC-1295 is a synthetic GHRH analog with Drug Affinity Complex (DAC) technology, extending its half-life. Ipamorelin is a selective growth hormone secretagogue that mimics ghrelin. When combined, research suggests a synergistic effect on GH release via complementary mechanisms — CJC-1295 amplifies the GH pulse while Ipamorelin triggers it. Preclinical data indicates this combination promotes pulsatile GH secretion while minimizing cortisol and prolactin elevation.",
    sequence: "CJC-1295: Modified GHRH (1-29) | Ipamorelin: Aib-His-D-2-Nal-D-Phe-Lys-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "bpc157-5",
    name: "BPC-157",
    dose: "5 mg",
    price: 35,
    bulk: 30,
    image: "/bpc157-5.jpg",
    category: "Recovery",
    research: "BPC-157 (Body Protection Compound-157) is a pentadecapeptide derived from human gastric juice. Extensive preclinical research demonstrates its involvement in angiogenesis, wound healing, and tissue repair across muscle, tendon, ligament, and nerve tissues. Studies suggest it modulates the nitric oxide system, upregulates growth factor expression, and interacts with the dopaminergic system. It has shown cytoprotective properties in various organ systems in animal models.",
    sequence: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "bpc157-10",
    name: "BPC-157",
    dose: "10 mg",
    price: 50,
    bulk: 45,
    image: "/bpc157-10.jpg",
    category: "Recovery",
    research: "BPC-157 (Body Protection Compound-157) is a pentadecapeptide derived from human gastric juice. Extensive preclinical research demonstrates its involvement in angiogenesis, wound healing, and tissue repair across muscle, tendon, ligament, and nerve tissues. Studies suggest it modulates the nitric oxide system, upregulates growth factor expression, and interacts with the dopaminergic system. It has shown cytoprotective properties in various organ systems in animal models.",
    sequence: "Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp-Asp-Ala-Gly-Leu-Val",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "tb500",
    name: "TB-500",
    dose: "10 mg",
    price: 55,
    bulk: 50,
    image: "/tb500.jpg",
    category: "Recovery",
    research: "TB-500 is a synthetic fraction of the naturally occurring thymosin beta-4 protein. Research has demonstrated its role in cell migration, blood vessel formation, and regulation of actin — a key cell-building protein. Preclinical studies indicate TB-500 promotes tissue repair by upregulating cell-building proteins, reducing inflammation, and facilitating new blood vessel growth. It has been studied for its effects on wound healing, cardiac tissue repair, and musculoskeletal recovery.",
    sequence: "Synthetic fragment of Thymosin Beta-4 (Tβ4)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "epitalon",
    name: "Epitalon",
    dose: "10 mg",
    price: 35,
    bulk: 30,
    image: "/epitalon.jpg",
    category: "Longevity",
    research: "Epitalon (Epithalon) is a synthetic tetrapeptide based on the natural epithalamin peptide produced by the pineal gland. Research has focused on its potential to activate telomerase, the enzyme responsible for maintaining telomere length — a key biomarker of cellular aging. Studies by Professor Khavinson demonstrated increased telomerase activity and telomere elongation in human somatic cells. Additional research suggests effects on melatonin production, circadian rhythm regulation, and antioxidant enzyme activity.",
    sequence: "Ala-Glu-Asp-Gly",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 6 weeks.",
    purity: "99%+",
  },
  {
    id: "ghkcu-50",
    name: "GHK-Cu",
    dose: "50 mg",
    price: 40,
    bulk: 35,
    image: "/ghkcu-50.jpg",
    category: "Longevity",
    research: "GHK-Cu (copper peptide) is a naturally occurring tripeptide with high affinity for copper(II) ions. Found in human plasma, saliva, and urine, its concentration declines with age. Research demonstrates it modulates over 4,000 human genes, promoting tissue remodeling, anti-inflammatory responses, and stem cell attraction to injury sites. Studies have examined its role in collagen synthesis, wound healing, skin regeneration, hair growth, and antioxidant defense mechanisms.",
    sequence: "Gly-His-Lys-Cu²⁺",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light. Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks.",
    purity: "99%+",
  },
  {
    id: "ghkcu-100",
    name: "GHK-Cu",
    dose: "100 mg",
    price: 55,
    bulk: 50,
    image: "/ghkcu-100.jpg",
    category: "Longevity",
    research: "GHK-Cu (copper peptide) is a naturally occurring tripeptide with high affinity for copper(II) ions. Found in human plasma, saliva, and urine, its concentration declines with age. Research demonstrates it modulates over 4,000 human genes, promoting tissue remodeling, anti-inflammatory responses, and stem cell attraction to injury sites. Studies have examined its role in collagen synthesis, wound healing, skin regeneration, hair growth, and antioxidant defense mechanisms.",
    sequence: "Gly-His-Lys-Cu²⁺",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light. Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks.",
    purity: "99%+",
  },
  {
    id: "ss31",
    name: "SS-31",
    dose: "10 mg",
    price: 80,
    bulk: 70,
    image: "/ss31.jpg",
    category: "Longevity",
    research: "SS-31 (Elamipretide) is a mitochondria-targeted tetrapeptide that selectively concentrates in the inner mitochondrial membrane. Research demonstrates it binds to cardiolipin, stabilizing the electron transport chain and reducing reactive oxygen species production. Preclinical studies show improved mitochondrial function, enhanced ATP production, and reduced oxidative stress. It has been investigated for age-related mitochondrial dysfunction, cardiac and renal conditions, and neurodegenerative research models.",
    sequence: "D-Arg-Dmt-Lys-Phe-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "ipamorelin",
    name: "Ipamorelin",
    dose: "5 mg",
    price: 35,
    bulk: 30,
    image: "/ipamorelin.jpg",
    category: "Growth Hormone",
    research: "Ipamorelin is a selective growth hormone secretagogue receptor (GHS-R) agonist and one of the most selective GH-releasing peptides studied. Unlike other GHRPs, research indicates it does not significantly elevate cortisol, acetylcholine, prolactin, or aldosterone levels at effective doses. Studies demonstrate dose-dependent GH release with a favorable selectivity profile. It has been researched for its effects on bone density, body composition, and growth hormone pulsatility.",
    sequence: "Aib-His-D-2-Nal-D-Phe-Lys-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "kisspeptin",
    name: "Kisspeptin",
    dose: "10 mg",
    price: 55,
    bulk: 45,
    image: "/kisspeptin.jpg",
    category: "Hormonal",
    research: "Kisspeptin is a neuropeptide encoded by the KISS1 gene and is a key regulator of the hypothalamic-pituitary-gonadal (HPG) axis. Research demonstrates it stimulates GnRH neurons, triggering the release of luteinizing hormone (LH) and follicle-stimulating hormone (FSH). Studies have examined its role in puberty onset, reproductive function, and as a diagnostic tool for reproductive disorders. It has been investigated for its effects on testosterone production and fertility markers.",
    sequence: "Kisspeptin-10 (KISS1 derived)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 3 weeks.",
    purity: "99%+",
  },
  {
    id: "motsc",
    name: "MOTS-c",
    dose: "10 mg",
    price: 60,
    bulk: 55,
    image: "/motsc.jpg",
    category: "Longevity",
    research: "MOTS-c (Mitochondrial Open Reading Frame of the Twelve S rRNA type-c) is a mitochondrial-derived peptide. Research led by Dr. Pinchas Cohen identified it as a key regulator of metabolic homeostasis. Studies demonstrate it activates AMPK, enhances glucose uptake, improves insulin sensitivity, and regulates fatty acid metabolism. It has been described as an exercise mimetic, with research showing it translocates to the nucleus during metabolic stress to regulate adaptive gene expression.",
    sequence: "16-amino acid mitochondrial-derived peptide",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "selank",
    name: "Selank",
    dose: "10 mg",
    price: 55,
    bulk: 45,
    image: "/selank.jpg",
    category: "Cognitive",
    research: "Selank is a synthetic analog of the immunomodulatory peptide tuftsin, developed at the Institute of Molecular Genetics of the Russian Academy of Sciences. Research indicates it influences the expression of brain-derived neurotrophic factor (BDNF), modulates the balance of T-helper cell cytokines, and affects enkephalin degradation. Studies have examined its anxiolytic, nootropic, and immunomodulatory properties. It is approved in Russia as an anxiolytic medication.",
    sequence: "Thr-Lys-Pro-Arg-Pro-Gly-Pro (Tuftsin analog with Gly-Pro extension)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "semax",
    name: "Semax",
    dose: "10 mg",
    price: 55,
    bulk: 45,
    image: "/semax.jpg",
    category: "Cognitive",
    research: "Semax is a synthetic peptide derived from a fragment of adrenocorticotropic hormone (ACTH 4-10). Developed at the Institute of Molecular Genetics, Russian Academy of Sciences, research demonstrates it increases BDNF and its signaling receptor TrkB in the hippocampus. Studies indicate neuroprotective, nootropic, and neurogenic properties. It has been investigated for cognitive enhancement, cerebrovascular conditions, and optic nerve health. Approved in Russia as a nootropic medication.",
    sequence: "Met-Glu-His-Phe-Pro-Gly-Pro (ACTH 4-10 with Pro-Gly-Pro extension)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "glow",
    name: "GLOW",
    dose: "70 mg",
    price: 160,
    bulk: 140,
    image: "/glow.jpg",
    category: "Blends",
    research: "GLOW is a proprietary peptide blend formulated by Tier One BioSystems for research applications targeting skin health and rejuvenation pathways. This 70 mg complex combines multiple bioactive peptides selected for their studied effects on collagen synthesis, cellular turnover, and tissue regeneration. The blend is designed for researchers investigating multi-pathway approaches to dermal matrix remodeling and growth factor signaling cascades.",
    sequence: "Proprietary multi-peptide blend",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks.",
    purity: "99%+",
  },
  {
    id: "klow",
    name: "KLOW",
    dose: "80 mg",
    price: 165,
    bulk: 145,
    image: "/klow.jpg",
    category: "Blends",
    research: "KLOW is a proprietary peptide blend developed by Tier One BioSystems for advanced metabolic research. This 80 mg formulation combines targeted peptides selected for their studied effects on metabolic signaling, energy homeostasis, and body composition regulation. The blend is designed for researchers investigating synergistic multi-pathway approaches to metabolic optimization and weight management signaling cascades.",
    sequence: "Proprietary multi-peptide blend",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks.",
    purity: "99%+",
  },
  {
    id: "hcg",
    name: "HCG",
    dose: "5000 IU",
    price: 65,
    bulk: 55,
    image: "/hcg.jpg",
    category: "Hormonal",
    research: "Human Chorionic Gonadotropin (HCG) is a glycoprotein hormone composed of alpha and beta subunits. Research demonstrates it mimics luteinizing hormone (LH) activity by binding to LH/CG receptors. Studies have extensively examined its role in stimulating Leydig cell testosterone production, supporting spermatogenesis, and maintaining testicular function. It is widely used in clinical research relating to hypogonadism, fertility protocols, and hormonal axis regulation.",
    sequence: "Glycoprotein hormone (α and β subunits, ~237 amino acids total)",
    storage: "Store powder in the refrigerator (35–46°F / 2–8°C). Once reconstituted, keep refrigerated and use within 30 days.",
    purity: "99%+",
  },
  {
    id: "mt1",
    name: "MT-1",
    dose: "10 mg",
    price: 40,
    bulk: 35,
    image: "/mt1.jpg",
    category: "Tanning",
    research: "Melanotan I (Afamelanotide) is a synthetic analog of alpha-melanocyte stimulating hormone (α-MSH). Research demonstrates it binds to the MC1R melanocortin receptor, stimulating melanogenesis — the production of melanin pigment. Studies have examined its photoprotective properties and its potential to increase eumelanin production in skin cells. It has been the subject of clinical research for conditions involving photosensitivity and has been investigated as a potential UV-protective compound.",
    sequence: "Ac-Ser-Tyr-Ser-Nle-Glu-His-D-Phe-Arg-Trp-Gly-Lys-Pro-Val-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light. Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "mt2",
    name: "MT-2",
    dose: "10 mg",
    price: 40,
    bulk: 35,
    image: "/mt2.jpg",
    category: "Tanning",
    research: "Melanotan II is a cyclic heptapeptide analog of α-MSH that acts as a non-selective agonist at melanocortin receptors (MC1R-MC5R). Research demonstrates broader receptor activity compared to MT-1, with studies examining its effects on melanogenesis, appetite, and libido through MC3R and MC4R activation. Preclinical research has investigated its dual melanotropic and aphrodisiac properties. Its cyclic structure provides enhanced metabolic stability compared to linear analogs.",
    sequence: "Ac-Nle-c[Asp-His-D-Phe-Arg-Trp-Lys]-NH₂",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light. Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "ta1",
    name: "Thymosin Alpha 1",
    dose: "10 mg",
    price: 95,
    bulk: 80,
    image: "/ta1.jpg",
    category: "Immune",
    research: "Thymosin Alpha 1 (Tα1) is a peptide naturally produced by the thymus gland, first isolated by Dr. Allan Goldstein. Research demonstrates it enhances T-cell maturation, dendritic cell function, and antibody responses. Studies indicate it modulates both innate and adaptive immunity by activating toll-like receptors (TLR2 and TLR9). It is approved in over 35 countries for various clinical applications and has been extensively studied for immune modulation in immunocompromised subjects.",
    sequence: "28-amino acid peptide (Ac-SDAAVDTSSEITTKDLKEKKEVVEEAEN-OH)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
  {
    id: "nad",
    name: "NAD+",
    dose: "500 mg",
    price: 70,
    bulk: 65,
    image: "/nad.jpg",
    category: "Longevity",
    research: "Nicotinamide adenine dinucleotide (NAD+) is a critical coenzyme found in every living cell. Research demonstrates it is essential for mitochondrial function, DNA repair via PARP enzymes, sirtuin activation, and cellular energy metabolism. NAD+ levels decline significantly with age, and this decline has been linked to metabolic dysfunction and age-related conditions. Studies have examined direct NAD+ supplementation for its effects on cellular energy production, circadian rhythm regulation, and genomic stability.",
    sequence: "C₂₁H₂₇N₇O₁₄P₂ (dinucleotide coenzyme)",
    storage: "Store powder in a standard home freezer (0°F / -18°C), away from light and moisture. Once reconstituted, use promptly.",
    purity: "99%+",
  },
  {
    id: "igf1lr3",
    name: "IGF-1 LR3",
    dose: "1 mg",
    price: 105,
    bulk: 90,
    image: "/igf1lr3.jpg",
    category: "Growth Hormone",
    research: "IGF-1 LR3 (Long R3 Insulin-like Growth Factor-1) is an 83-amino acid analog of human IGF-1 with an arginine substitution at position 3 and a 13-amino acid N-terminal extension. This modification dramatically reduces binding to IGF binding proteins (IGFBPs), resulting in enhanced bioavailability and a significantly longer half-life. Research demonstrates it activates the IGF-1 receptor, promoting cell proliferation, differentiation, and survival signaling via the PI3K/Akt and MAPK/ERK pathways.",
    sequence: "83-amino acid modified IGF-1 (Arg³ substitution + N-terminal extension)",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 2 weeks. Reconstitute using 0.1M acetic acid.",
    purity: "99%+",
  },
  {
    id: "kpv",
    name: "KPV",
    dose: "10 mg",
    price: 60,
    bulk: 50,
    image: "/kpv.jpg",
    category: "Immune",
    research: "KPV is a naturally occurring tripeptide derived from the C-terminal end of alpha-melanocyte stimulating hormone (α-MSH). Research demonstrates potent anti-inflammatory activity through inhibition of NF-κB signaling, a master regulator of inflammatory gene expression. Studies have examined its effects on gut inflammation, skin inflammatory conditions, and wound healing. Unlike full-length α-MSH, KPV retains anti-inflammatory properties without melanotropic activity, making it a focused research tool.",
    sequence: "Lys-Pro-Val",
    storage: "Store powder in a standard home freezer (0°F / -18°C). Once reconstituted, refrigerate (35–46°F / 2–8°C) and use within 4 weeks.",
    purity: "99%+",
  },
];

// ─── Lab Results (Certificate of Analysis) ───────────────────────────────────
const LAB_RESULTS = {
  "GLP-3RT 5 mg": {
    lotNumber: "T1B-GLP3-5-2026-0412",
    dateAnalyzed: "2026-03-18",
    molecularWeight: "3421.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.27 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.47%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3421.8 ± 1.0 Da", result: "3421.6 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.3%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.2%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "8.1%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GLP-3RT 10 mg": {
    lotNumber: "T1B-GLP3-10-2026-0413",
    dateAnalyzed: "2026-03-18",
    molecularWeight: "3421.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.41 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.52%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3421.8 ± 1.0 Da", result: "3421.7 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "88.1%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.9%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "7.6%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GLP-3RT 30 mg": {
    lotNumber: "T1B-GLP3-30-2026-0414",
    dateAnalyzed: "2026-03-19",
    molecularWeight: "3421.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "30.00 mg/vial", result: "30.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "27.00–33.00 mg/vial", result: "31.18 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.39%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3421.8 ± 1.0 Da", result: "3421.9 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.5%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.6%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "8.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Tesamorelin": {
    lotNumber: "T1B-TESA-2026-0389",
    dateAnalyzed: "2026-03-15",
    molecularWeight: "5135.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.14 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.31%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "5135.9 ± 1.5 Da", result: "5135.7 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "85.9%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.1%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "9.4%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "CJC-1295 / Ipamorelin": {
    lotNumber: "T1B-CJCI-2026-0401",
    dateAnalyzed: "2026-03-20",
    molecularWeight: "CJC: 3367.9 Da / Ipa: 711.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "12.00 mg/vial", result: "12.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "10.80–13.20 mg/vial", result: "12.53 mg/vial", pass: true },
      { test: "Purity — CJC-1295 (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.52%", pass: true },
      { test: "Purity — Ipamorelin (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.38%", pass: true },
      { test: "Mass Confirmation — CJC-1295", method: "ESI-MS", specification: "3367.9 ± 1.0 Da", result: "3368.1 Da", pass: true },
      { test: "Mass Confirmation — Ipamorelin", method: "ESI-MS", specification: "711.9 ± 0.5 Da", result: "711.8 Da", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.7%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "BPC-157 5 mg": {
    lotNumber: "T1B-BPC-5-2026-0377",
    dateAnalyzed: "2026-03-12",
    molecularWeight: "1419.5 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.19 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.61%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1419.5 ± 0.5 Da", result: "1419.4 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "88.2%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.6%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "7.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "BPC-157 10 mg": {
    lotNumber: "T1B-BPC-10-2026-0378",
    dateAnalyzed: "2026-03-13",
    molecularWeight: "1419.5 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.38 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.57%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1419.5 ± 0.5 Da", result: "1419.5 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.6%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.9%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "8.2%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "TB-500": {
    lotNumber: "T1B-TB5-2026-0395",
    dateAnalyzed: "2026-03-17",
    molecularWeight: "4963.5 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.64 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.28%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "4963.5 ± 1.5 Da", result: "4963.3 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "84.5%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.7%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "10.2%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Epitalon": {
    lotNumber: "T1B-EPI-2026-0408",
    dateAnalyzed: "2026-03-22",
    molecularWeight: "390.3 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "20.00 mg/vial", result: "20.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "18.00–22.00 mg/vial", result: "20.73 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.72%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "390.3 ± 0.5 Da", result: "390.3 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "91.0%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "2.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GHK-Cu 50 mg": {
    lotNumber: "T1B-GHK50-2026-0416",
    dateAnalyzed: "2026-03-25",
    molecularWeight: "403.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "Blue lyophilized powder", result: "Blue lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "50.00 mg/vial", result: "50.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "45.00–55.00 mg/vial", result: "51.57 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.68%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "403.9 ± 0.5 Da", result: "403.9 Da", pass: true },
      { test: "Copper Content", method: "ICP-MS", specification: "15.0–16.5%", result: "15.5%", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.6%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.4%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GHK-Cu 100 mg": {
    lotNumber: "T1B-GHK-2026-0415",
    dateAnalyzed: "2026-03-25",
    molecularWeight: "403.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "Blue lyophilized powder", result: "Blue lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "100.00 mg/vial", result: "100.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "90.00–110.00 mg/vial", result: "103.47 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.55%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "403.9 ± 0.5 Da", result: "403.8 Da", pass: true },
      { test: "Copper Content", method: "ICP-MS", specification: "15.0–16.5%", result: "15.8%", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "89.4%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.1%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "SS-31": {
    lotNumber: "T1B-SS31-2026-0421",
    dateAnalyzed: "2026-03-26",
    molecularWeight: "639.8 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "15.00 mg/vial", result: "15.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "13.50–16.50 mg/vial", result: "15.82 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.34%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "639.8 ± 0.5 Da", result: "639.7 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.1%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.5%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Ipamorelin": {
    lotNumber: "T1B-IPA-2026-0383",
    dateAnalyzed: "2026-03-14",
    molecularWeight: "711.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.11 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.44%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "711.9 ± 0.5 Da", result: "711.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.6%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.0%", pass: true },
      { test: "Acetate Content", method: "Ion Chromatography", specification: "≤ 15.0%", result: "8.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Kisspeptin": {
    lotNumber: "T1B-KISS-2026-0427",
    dateAnalyzed: "2026-03-28",
    molecularWeight: "1302.5 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "4.87 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.19%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1302.5 ± 0.5 Da", result: "1302.4 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "85.3%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.2%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "MOTS-c": {
    lotNumber: "T1B-MOT-2026-0430",
    dateAnalyzed: "2026-03-29",
    molecularWeight: "2174.6 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.29 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.25%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "2174.6 ± 1.0 Da", result: "2174.5 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.8%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.7%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Selank": {
    lotNumber: "T1B-SEL-2026-0392",
    dateAnalyzed: "2026-03-16",
    molecularWeight: "751.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.33 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.58%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "751.9 ± 0.5 Da", result: "751.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "88.9%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.4%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Semax": {
    lotNumber: "T1B-SEM-2026-0398",
    dateAnalyzed: "2026-03-19",
    molecularWeight: "813.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.52 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.41%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "813.9 ± 0.5 Da", result: "813.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.2%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.3%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "GLOW": {
    lotNumber: "T1B-GLW-2026-0435",
    dateAnalyzed: "2026-03-30",
    molecularWeight: "Proprietary blend",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "70.00 mg/vial", result: "70.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "63.00–77.00 mg/vial", result: "72.41 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.33%", pass: true },
      { test: "Component Verification", method: "LC-MS/MS", specification: "All components confirmed", result: "All confirmed", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "85.6%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "KLOW": {
    lotNumber: "T1B-KLW-2026-0438",
    dateAnalyzed: "2026-03-31",
    molecularWeight: "Proprietary blend",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "80.00 mg/vial", result: "80.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "72.00–88.00 mg/vial", result: "83.16 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.27%", pass: true },
      { test: "Component Verification", method: "LC-MS/MS", specification: "All components confirmed", result: "All confirmed", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "84.8%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.3%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "HCG": {
    lotNumber: "T1B-HCG-2026-0405",
    dateAnalyzed: "2026-03-21",
    molecularWeight: "~25,700 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Content", method: "Gravimetric", specification: "5,000 IU/vial", result: "5,000 IU/vial", pass: true },
      { test: "Actual Content", method: "Bioassay", specification: "4,500–5,500 IU/vial", result: "5,210 IU/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.15%", pass: true },
      { test: "Identity Confirmation", method: "SDS-PAGE / Western Blot", specification: "Consistent with HCG", result: "Confirmed", pass: true },
      { test: "Biological Activity", method: "Bioassay", specification: "≥ 5,000 IU/mg", result: "5,420 IU/mg", pass: true },
      { test: "Protein Content", method: "Bradford Assay", specification: "≥ 80%", result: "86.2%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "MT-1": {
    lotNumber: "T1B-MT1-2026-0418",
    dateAnalyzed: "2026-03-24",
    molecularWeight: "1646.9 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.17 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.39%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1646.9 ± 0.5 Da", result: "1646.8 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "87.1%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "MT-2": {
    lotNumber: "T1B-MT2-2026-0419",
    dateAnalyzed: "2026-03-24",
    molecularWeight: "1024.2 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "9.83 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.46%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "1024.2 ± 0.5 Da", result: "1024.1 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "88.5%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.2%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "Thymosin Alpha 1": {
    lotNumber: "T1B-TA1-2026-0424",
    dateAnalyzed: "2026-03-27",
    molecularWeight: "3108.3 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "5.00 mg/vial", result: "5.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "4.50–5.50 mg/vial", result: "5.22 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.37%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "3108.3 ± 1.0 Da", result: "3108.2 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "86.4%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "4.8%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "NAD+": {
    lotNumber: "T1B-NAD-2026-0410",
    dateAnalyzed: "2026-03-23",
    molecularWeight: "663.4 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Content", method: "Gravimetric", specification: "500.00 mg/vial", result: "500.00 mg/vial", pass: true },
      { test: "Actual Content", method: "UV Quantitation", specification: "450.00–550.00 mg/vial", result: "518.40 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.62%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "663.4 ± 0.5 Da", result: "663.4 Da", pass: true },
      { test: "Identity Confirmation", method: "UV/Vis Spectroscopy", specification: "λmax 259 nm", result: "λmax 259 nm", pass: true },
      { test: "Content Assay", method: "UV Quantitation", specification: "≥ 95%", result: "97.8%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "3.0%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "BAC Water": {
    lotNumber: "T1B-BAC-2026-0440",
    dateAnalyzed: "2026-03-31",
    molecularWeight: "N/A",
    tests: [
      { test: "Appearance", method: "Visual", specification: "Clear, colorless solution", result: "Clear, colorless", pass: true },
      { test: "Labeled Volume", method: "Gravimetric", specification: "30.00 mL/vial", result: "30.00 mL/vial", pass: true },
      { test: "Actual Volume", method: "Volumetric", specification: "29.50–30.50 mL/vial", result: "30.21 mL/vial", pass: true },
      { test: "pH", method: "Potentiometric", specification: "4.5–7.0", result: "5.4", pass: true },
      { test: "Benzyl Alcohol Content", method: "GC-FID", specification: "0.85–0.95%", result: "0.90%", pass: true },
      { test: "Particulate Matter", method: "USP <788>", specification: "Meets USP requirements", result: "Within limits", pass: true },
      { test: "Sterility", method: "USP <71>", specification: "No growth", result: "No growth", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 0.25 EU/mL", result: "< 0.1 EU/mL", pass: true },
    ],
  },
  "IGF-1 LR3": {
    lotNumber: "T1B-IGF-2026-0433",
    dateAnalyzed: "2026-03-29",
    molecularWeight: "9111.4 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "1.00 mg/vial", result: "1.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "0.90–1.10 mg/vial", result: "1.06 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.21%", pass: true },
      { test: "Mass Confirmation", method: "MALDI-TOF", specification: "9111.4 ± 5.0 Da", result: "9112.1 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "83.7%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "5.9%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
  "KPV": {
    lotNumber: "T1B-KPV-2026-0437",
    dateAnalyzed: "2026-03-30",
    molecularWeight: "342.4 Da",
    tests: [
      { test: "Appearance", method: "Visual", specification: "White to off-white lyophilized powder", result: "White lyophilized powder", pass: true },
      { test: "Labeled Peptide Content", method: "Gravimetric", specification: "10.00 mg/vial", result: "10.00 mg/vial", pass: true },
      { test: "Actual Peptide Content", method: "RP-HPLC Quantitation", specification: "9.00–11.00 mg/vial", result: "10.44 mg/vial", pass: true },
      { test: "Purity (HPLC)", method: "RP-HPLC", specification: "≥ 99.0%", result: "99.68%", pass: true },
      { test: "Mass Confirmation", method: "ESI-MS", specification: "342.4 ± 0.5 Da", result: "342.4 Da", pass: true },
      { test: "Amino Acid Analysis", method: "AAA", specification: "Consistent with structure", result: "Consistent", pass: true },
      { test: "Peptide Content", method: "Nitrogen Analysis", specification: "≥ 80%", result: "90.2%", pass: true },
      { test: "Water Content", method: "Karl Fischer", specification: "≤ 8.0%", result: "2.7%", pass: true },
      { test: "Bacterial Endotoxins", method: "LAL", specification: "< 5 EU/mg", result: "< 1 EU/mg", pass: true },
      { test: "Residual Solvents", method: "GC-HS", specification: "Meets USP <467>", result: "Within limits", pass: true },
    ],
  },
};

function getLabResults(productName, dose) {
  // Check for dose-specific entry first (e.g., "GLP-3RT 5 mg")
  const doseKey = dose ? `${productName} ${dose}` : productName;
  if (LAB_RESULTS[doseKey]) return LAB_RESULTS[doseKey];
  if (LAB_RESULTS[productName]) return LAB_RESULTS[productName];
  return null;
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
function CountUp({ end, duration = 1500, suffix = "", prefix = "" }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
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
  }, [end, duration]);
  return <span ref={ref}>{prefix}{count}{suffix}</span>;
}

// ─── Page Title & Meta Helper ─────────────────────────────────────────────────
function usePageMeta(title, description) {
  useEffect(() => {
    const suffix = " | Tier One BioSystems";
    const fullTitle = title ? title + suffix : "Tier One BioSystems — Research Grade Peptides";
    document.title = fullTitle;
    const setMeta = (selector, value) => {
      if (!value) return;
      const el = document.querySelector(selector);
      if (el) el.setAttribute("content", value);
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', fullTitle);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', window.location.href);
    setMeta('meta[name="twitter:title"]', fullTitle);
    setMeta('meta[name="twitter:description"]', description);
    return () => {
      document.title = "Tier One BioSystems — Research Grade Peptides";
    };
  }, [title, description]);
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
    --bg-primary: #0a0a0a;
    --bg-card: #111111;
    --bg-card-hover: #1a1a1a;
    --bg-modal: #0d0d0d;
    --red-primary: #c41e2a;
    --red-glow: #ff2d3b;
    --red-dark: #8b1520;
    --text-primary: #f0f0f0;
    --text-secondary: #888888;
    --text-dim: #555555;
    --border: #222222;
    --border-hover: #333333;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: 'Rajdhani', sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  #root { min-height: 100vh; }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-primary); }
  ::-webkit-scrollbar-thumb { background: var(--red-dark); border-radius: 3px; }

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

  .hero-grid-line {
    position: absolute;
    background: linear-gradient(to bottom, transparent, rgba(196,30,42,0.06), transparent);
    width: 1px;
    height: 100%;
    top: 0;
  }
`;
document.head.appendChild(style);

// ─── Components ──────────────────────────────────────────────────────────────

function CartPopup({ cart, visible, onClose }) {
  const navigate = useNavigate();
  if (!visible || cart.length === 0) return null;

  const tieredPrice = (item) => {
    if (item.qty >= 25) return Math.round(item.bulk * 0.90 * 100) / 100;
    if (item.qty >= 10) return Math.round(item.bulk * 0.95 * 100) / 100;
    if (item.qty >= 5) return item.bulk;
    return item.price;
  };
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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Close menu when navigating
  const handleNav = (dest) => {
    setMenuOpen(false);
    if (dest === "Products") navigate("/products");
    else if (dest === "Lab Results") navigate("/lab-results");
    else if (dest === "Calculator") navigate("/calculator");
    else if (dest === "Contact") navigate("/contact");
    else if (dest === "Cart") navigate("/cart");
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
      <div style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: isMobile ? "6px 16px" : "6px 24px",
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
              height: 90,
              width: "auto",
              objectFit: "contain",
            }}
          />
        </div>

        <nav style={{ display: "flex", gap: isMobile ? 16 : 32, alignItems: "center" }}>
          {/* Desktop nav */}
          {!isMobile && ["Products", "Lab Results", "Calculator", "Contact"].map(item => (
            <span
              key={item}
              onClick={() => handleNav(item)}
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                cursor: "pointer",
                transition: "color 0.2s",
                position: "relative",
              }}
              onMouseEnter={e => e.target.style.color = "var(--red-primary)"}
              onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}
            >{item}</span>
          ))}

          {/* Cart icon (always visible) */}
          <div aria-label="Shopping cart" onClick={() => { setMenuOpen(false); navigate("/cart"); }} style={{ position: "relative", display: "inline-flex", cursor: "pointer" }}>
            <span style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 22,
              color: "var(--text-secondary)",
              userSelect: "none",
            }}>🛒</span>
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
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(!menuOpen)}
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
          {["Products", "Lab Results", "Calculator", "Contact", "Cart"].map(item => (
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
                color: "var(--text-secondary)",
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

function Hero() {
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
      paddingTop: 120,
      paddingBottom: 80,
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
        backgroundSize: isMobile ? "150% auto" : "auto 100%",
        backgroundPosition: `center ${(isMobile ? 25 : 45) + scrollY * 0.012}%`,
        backgroundRepeat: "no-repeat",
        opacity: 0.52,
        pointerEvents: "none",
        animation: "heroZoom 24s ease-in-out infinite alternate",
      }} />

      {/* Dark overlay for text readability */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(10,10,10,0.4) 0%, rgba(10,10,10,0.7) 50%, rgba(10,10,10,0.95) 100%)",
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
          background: "rgba(10,10,10,0.6)",
          padding: "14px 18px",
          borderLeft: "2px solid rgba(196,30,42,0.4)",
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
              border: "1px solid rgba(196,30,42,0.2)",
              background: "rgba(10,10,10,0.5)",
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
              }}><CountUp end={stat.value} prefix={stat.prefix || ""} suffix={stat.suffix} duration={1800} /></div>
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
        <div className="product-card-inner" style={{ position: "absolute", inset: 0 }}>
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
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "16px 18px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}>{product.name}</div>

        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 600,
          fontSize: 16,
          color: "var(--text-secondary)",
          marginBottom: 14,
        }}>{product.dose}</div>

        <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 700,
            fontSize: 26,
            color: "var(--text-primary)",
          }}>${product.price}</span>
          <span style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 18,
            color: "var(--red-primary)",
            fontWeight: 700,
          }}>5+ @ ${product.bulk}</span>
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
        maxWidth: 640,
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
          background: "#080808",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          height: isMobile ? 280 : 360,
        }}>
          <img src={product.image} alt={product.name} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", padding: 16 }} />
        </div>

        {/* Info */}
        <div style={{ padding: "20px 24px" }}>
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 24 }}>${product.price}</span>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--text-secondary)" }}>/vial</span>
          </div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, color: "var(--red-primary)", fontWeight: 700, marginBottom: 20 }}>5+ Vials: ${product.bulk} each</div>

          {/* Purity + Form */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[{ label: "PURITY", value: product.purity }, { label: "FORM", value: "Lyophilized" }].map((s, i) => (
              <div key={i} style={{ padding: "8px 12px", border: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-dim)", marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{s.value}</div>
              </div>
            ))}
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

function Footer() {
  const navigate = useNavigate();
  const linkStyle = {
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: 13,
    color: "var(--text-secondary)",
    cursor: "pointer",
    textDecoration: "none",
    transition: "color 0.2s",
    display: "block",
    padding: "4px 0",
  };
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
      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "0 24px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 40,
        marginBottom: 40,
      }}>
        <div>
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
          <a onClick={() => navigate("/products")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>All Products</a>
          <a onClick={() => navigate("/lab-results")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Lab Results</a>
          <a onClick={() => navigate("/calculator")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Reconstitution Calculator</a>
        </div>

        <div>
          <div style={headingStyle}>Info</div>
          <a onClick={() => navigate("/about")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>About</a>
          <a onClick={() => navigate("/faq")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>FAQ</a>
          <a onClick={() => navigate("/testing-standards")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Testing Standards</a>
          <a onClick={() => navigate("/contact")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Contact</a>
        </div>

        <div>
          <div style={headingStyle}>Policies</div>
          <a onClick={() => navigate("/shipping")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Shipping</a>
          <a onClick={() => navigate("/returns")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Returns</a>
          <a onClick={() => navigate("/terms")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Terms of Service</a>
          <a onClick={() => navigate("/privacy")} style={linkStyle} onMouseEnter={e => e.target.style.color = "var(--red-primary)"} onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>Privacy Policy</a>
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

function SyringeDiagram({ units }) {
  const BL = 100, BR = 460, BT = 28, BH = 26;
  const BB = BT + BH, BW = BR - BL, CY = BT + BH / 2;
  const safe = Math.min(100, Math.max(0, units || 0));
  const fillW = (safe / 100) * (BW - 2);

  return (
    <div style={{ padding: "0 0 14px" }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.15em",
        color: "var(--red-primary)",
        textTransform: "uppercase",
        marginBottom: 2,
        textAlign: "center",
      }}>Syringe Fill</div>

      <svg viewBox="0 0 560 88" width="100%" style={{ display: "block", overflow: "visible" }}>
        {/* Plunger handle */}
        <rect x={8} y={BT - 8} width={16} height={BH + 16} rx={3}
          fill="none" stroke="rgba(196,30,42,0.5)" strokeWidth={2} />
        {/* Plunger rod */}
        <rect x={24} y={CY - 3} width={BL - 30} height={6}
          fill="rgba(196,30,42,0.2)" />
        {/* Plunger stopper */}
        <rect x={BL - 5} y={BT} width={7} height={BH} rx={2}
          fill="rgba(196,30,42,0.5)" />

        {/* Red fill — starts from needle side (right) */}
        <rect
          x={BR - 1 - fillW} y={BT + 1} height={BH - 2}
          width={fillW}
          fill="rgba(196,30,42,0.65)"
          style={{ transition: "width 0.7s cubic-bezier(0.4,0,0.2,1), x 0.7s cubic-bezier(0.4,0,0.2,1)" }}
        />

        {/* Barrel */}
        <rect x={BL} y={BT} width={BW} height={BH} rx={3}
          fill="none" stroke="rgba(196,30,42,0.4)" strokeWidth={2} />

        {/* Graduation marks + labels — 0 at needle side (right), 100 at plunger (left) */}
        {[0,10,20,30,40,50,60,70,80,90,100].map(n => {
          const x = BL + (n / 100) * BW;
          const label = 100 - n;
          return (
            <g key={n}>
              <line x1={x} y1={BB} x2={x} y2={BB + 8}
                stroke="rgba(196,30,42,0.5)" strokeWidth={1.5} />
              <text x={x} y={BB + 18}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize={8}
                fontFamily="'Orbitron', sans-serif">{label}</text>
            </g>
          );
        })}

        {/* Needle — extends straight from barrel */}
        <line x1={BR} y1={CY} x2={BR + 60} y2={CY}
          stroke="rgba(190,190,190,0.85)" strokeWidth={1.5} />
      </svg>

      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 13,
        color: units ? "var(--text-primary)" : "var(--text-secondary)",
        marginTop: 4,
        letterSpacing: "0.05em",
        textAlign: "center",
      }}>
        {units ? `${Math.round(units)} / 100 units` : "awaiting input"}
      </div>
    </div>
  );
}

// ─── Peptide Calculator ───────────────────────────────────────────────────────

function PeptideCalculator() {
  usePageMeta("Peptide Reconstitution Calculator", "Free peptide reconstitution calculator. Calculate BAC water volume, concentration, and syringe units for research peptide preparation.");
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
  const insulinUnits = volumeMl ? volumeMl * 100 : null;

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
        }}>Peptide Reconstitution<br />Calculator</h2>
        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          color: "var(--text-secondary)",
          maxWidth: 520,
          margin: "0 auto",
          lineHeight: 1.7,
        }}>Enter your vial size, how much BAC water you're adding, and your desired dose to calculate exactly how much to draw.</p>
      </div>

      {/* Inputs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 24,
        marginBottom: 40,
      }}>
        <div>
          <label style={labelStyle}>Vial Size (mg)</label>
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
          <label style={labelStyle}>BAC Water Added (mL)</label>
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
          <label style={labelStyle}>Desired Dose</label>
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
              label: "Syringe",
              value: insulinUnits ? `${Math.round(insulinUnits)} units` : "—",
              sub: "on a 100-unit syringe",
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

      {/* Syringe */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0" }}>
        <div style={{ width: "100%", maxWidth: 560 }}>
          <SyringeDiagram units={insulinUnits} />
        </div>
      </div>

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
          <li>Draw your desired amount of BAC water into a syringe.</li>
          <li>Slowly inject it down the side of the vial — do not shake.</li>
          <li>Gently swirl until the powder is fully dissolved.</li>
          <li>Using the result above, draw the calculated units into a fresh syringe for each dose.</li>
          <li>Store reconstituted solution in the refrigerator and use within the timeframe listed on your product.</li>
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
      }}>For research use only. This calculator is provided as a convenience tool. Always verify calculations independently.</div>
    </div>
  );
}

// ─── Contact Page ────────────────────────────────────────────────────────────

function ContactPage() {
  usePageMeta("Contact Us", "Get in touch with Tier One BioSystems. Questions about research peptides, orders, or wholesale inquiries.");
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

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
    const formData = new URLSearchParams();
    formData.append("form-name", "contact");
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
    }).catch((err) => console.error("Form error:", err));
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
          <button type="submit" style={{
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
          }}
            onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "var(--red-primary)"; }}
            onMouseLeave={e => { e.target.style.background = "var(--red-primary)"; e.target.style.color = "#fff"; }}
          >Send Message</button>
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
  usePageMeta("Your Cart", "Review your order and checkout at Tier One BioSystems.");
  const navigate = useNavigate();
  const [step, setStep] = useState("cart"); // cart, info, payment, confirmed
  const [customerInfo, setCustomerInfo] = useState({
    name: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
  });
  const [orderNumber, setOrderNumber] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [paymentMethod, setPaymentMethod] = useState("cashapp"); // cashapp | venmo
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(null); // { code, type, value, label }
  const [discountError, setDiscountError] = useState("");
  const [discountLoading, setDiscountLoading] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  function updateQty(id, delta) {
    setCart(prev => prev
      .map(item => item.id === id ? { ...item, qty: item.qty + delta } : item)
      .filter(item => item.qty > 0)
    );
  }

  // Calculate price per item with tiered bulk discounts
  // 1-4: regular price | 5-9: bulk | 10-24: bulk -5% | 25+: bulk -10%
  function getItemPrice(item) {
    if (item.qty >= 25) return Math.round(item.bulk * 0.90 * 100) / 100;
    if (item.qty >= 10) return Math.round(item.bulk * 0.95 * 100) / 100;
    if (item.qty >= 5) return item.bulk;
    return item.price;
  }

  const subtotal = cart.reduce((sum, item) => sum + getItemPrice(item) * item.qty, 0);

  // Calculate discount amount based on applied code
  const discountAmount = appliedDiscount
    ? appliedDiscount.type === "percent"
      ? Math.min(subtotal, subtotal * (appliedDiscount.value / 100))
      : Math.min(subtotal, appliedDiscount.value)
    : 0;
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

  // Shipping: $10 flat, free at $200+ (calculated against post-discount subtotal)
  const shipping = subtotalAfterDiscount >= 200 ? 0 : (cart.length > 0 ? 10 : 0);
  const total = subtotalAfterDiscount + shipping;

  async function applyDiscountCode() {
    const code = discountInput.trim().toUpperCase();
    if (!code) {
      setDiscountError("Enter a discount code.");
      return;
    }
    setDiscountLoading(true);
    setDiscountError("");
    try {
      const res = await fetch("/.netlify/functions/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({ valid: false, error: "Could not reach discount service." }));
      if (!res.ok || !data.valid) {
        setAppliedDiscount(null);
        setDiscountError(data.error || "Invalid discount code.");
        return;
      }
      setAppliedDiscount({
        code: data.code,
        type: data.type,
        value: data.value,
        label: data.label,
      });
      setDiscountError("");
    } catch (err) {
      console.error("Discount validation error:", err);
      setAppliedDiscount(null);
      setDiscountError("Could not reach discount service. Try again.");
    } finally {
      setDiscountLoading(false);
    }
  }

  function removeDiscountCode() {
    setAppliedDiscount(null);
    setDiscountInput("");
    setDiscountError("");
  }

  function generateOrderNumber() {
    const date = new Date();
    const y = date.getFullYear().toString().slice(-2);
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);
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

  function handlePaymentConfirmed() {
    const { name, email, phone, address, city, state, zip } = customerInfo;

    // Build order items text
    const itemsText = cart.map(item => {
      const unitPrice = getItemPrice(item);
      const isBulk = item.qty >= 5;
      return `${item.name} ${item.dose} x${item.qty} @ $${unitPrice.toFixed(2)}${isBulk ? " (bulk)" : ""} = $${(unitPrice * item.qty).toFixed(2)}`;
    }).join("\n");

    // Submit to Netlify Forms
    const formData = new URLSearchParams();
    formData.append("form-name", "order");
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
    formData.append("discountCode", appliedDiscount ? appliedDiscount.code : "");
    formData.append("discountAmount", appliedDiscount ? `-$${discountAmount.toFixed(2)}` : "");
    formData.append("shipping", shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`);
    formData.append("paymentMethod", paymentMethod === "venmo" ? "Venmo" : "Cash App");
    formData.append("orderTotal", `$${total.toFixed(2)}`);

    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }).then((res) => {
      if (!res.ok) console.error("Order submission failed:", res.status);
    }).catch((err) => console.error("Order error:", err));

    // Send confirmation email to customer via EmailJS
    emailjs.send("service_r3r7crs", "template_i9k8u2a", {
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      orderNumber: orderNumber,
      orderItems: itemsText,
      orderSubtotal: `$${subtotal.toFixed(2)}`,
      discountCode: appliedDiscount ? appliedDiscount.code : "",
      discountAmount: appliedDiscount ? `-$${discountAmount.toFixed(2)}` : "",
      shipping: shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`,
      paymentMethod: paymentMethod === "venmo" ? "Venmo" : "Cash App",
      orderTotal: `$${total.toFixed(2)}`,
      shippingAddress: address,
      shippingCity: city,
      shippingState: state,
      shippingZip: zip,
    }, "E2QQt-tqFcuyhtZOD").then(() => {
      console.log("Confirmation email sent");
    }).catch((err) => console.error("Email error:", err));

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
            Save your order number for reference. A confirmation has been sent to your email.
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

            <p style={{ margin: "12px 0 0", fontWeight: 600, color: "var(--text-primary)", fontSize: 17 }}>Step 3: Confirm below</p>
          </div>
        </div>

        <button onClick={handlePaymentConfirmed} style={{
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
        >I HAVE SENT PAYMENT</button>

        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 14,
          color: "var(--text-dim)",
          textAlign: "center",
          lineHeight: 1.6,
        }}>
          Orders are processed within 24 hours of payment confirmation.
          <br />If you have questions, contact us at info@tierone.bio
        </div>
      </div>
    );
  }

  // ─── Customer Info Screen ────────────────────────────
  if (step === "info") {
    const allFilled = customerInfo.name && customerInfo.email && customerInfo.phone &&
      customerInfo.address && customerInfo.city && customerInfo.state && customerInfo.zip;

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
            <button type="submit" style={{
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
                      }}>Add {5 - item.qty} more for ${item.bulk}/vial</div>
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

          {/* Discount code section */}
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
            {appliedDiscount ? (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                border: "1px solid rgba(34,197,94,0.3)",
                background: "rgba(34,197,94,0.05)",
                marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#22c55e",
                    letterSpacing: "0.1em",
                  }}>{appliedDiscount.code}</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 14,
                    color: "var(--text-secondary)",
                  }}>— {appliedDiscount.label} applied</span>
                </div>
                <button
                  type="button"
                  onClick={removeDiscountCode}
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
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={discountInput}
                    disabled={discountLoading}
                    onChange={e => { setDiscountInput(e.target.value); if (discountError) setDiscountError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyDiscountCode(); } }}
                    placeholder="Enter code"
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
            {shipping > 0 && subtotalAfterDiscount < 200 && (
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: 13,
                color: "var(--text-dim)",
                fontStyle: "italic",
              }}>Add ${(200 - subtotalAfterDiscount).toFixed(2)} more for free shipping</div>
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
  usePageMeta("Lab Results — Certificates of Analysis", "Third-party verified lab results and Certificates of Analysis for all Tier One BioSystems research peptides. 99%+ purity guaranteed.");
  const [searchParams] = useSearchParams();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);

  // Auto-expand product if navigated from a product page
  const productParam = searchParams.get("product");
  const doseParam = searchParams.get("dose");
  const autoKey = productParam && doseParam ? `${productParam} ${doseParam}` : productParam;
  const [expandedProduct, setExpandedProduct] = useState(
    autoKey && (LAB_RESULTS[autoKey] || LAB_RESULTS[productParam]) ? (LAB_RESULTS[autoKey] ? autoKey : productParam) : null
  );

  // Scroll to the expanded product on mount
  useEffect(() => {
    if (expandedProduct) {
      setTimeout(() => {
        const el = document.getElementById(`coa-${expandedProduct}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Get unique product names (no duplicate dose variants)
  // Build list of products with lab results — show each dose variant separately for multi-dose products
  const uniqueProducts = [];
  const seen = new Set();
  PRODUCTS.forEach(p => {
    const doseKey = `${p.name} ${p.dose}`;
    // If there's a dose-specific COA entry, show it separately
    if (LAB_RESULTS[doseKey] && !seen.has(doseKey)) {
      seen.add(doseKey);
      uniqueProducts.push({ ...p, coaKey: doseKey, displayName: `${p.name} — ${p.dose}` });
    } else if (!LAB_RESULTS[doseKey] && !seen.has(p.name) ) {
      seen.add(p.name);
      uniqueProducts.push({ ...p, coaKey: p.name, displayName: p.name });
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
          Every compound is independently tested and verified. Below are the analytical results
          for each product in our catalog, conducted by third-party laboratories.
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
              {/* Clickable header row */}
              <div
                onClick={() => setExpandedProduct(isExpanded ? null : product.coaKey)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: isMobile ? "16px 16px" : "18px 28px",
                  cursor: "pointer",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    fontSize: isMobile ? 14 : 16,
                    letterSpacing: "0.03em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>{product.displayName}</div>
                  <div style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 13,
                    color: "var(--text-dim)",
                    whiteSpace: "nowrap",
                    display: isMobile ? "none" : "block",
                  }}>Lot: {coa.lotNumber}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                  <span style={{
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    padding: "4px 12px",
                    background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    color: "#22c55e",
                  }}>ALL TESTS PASSED</span>
                  <span style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: 20,
                    color: "var(--text-secondary)",
                    transition: "transform 0.3s",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    display: "inline-block",
                  }}>&#9660;</span>
                </div>
              </div>

              {/* Expanded COA details */}
              {isExpanded && (
                <div style={{
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
        }}>THIRD-PARTY VERIFIED</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 15,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          maxWidth: 700,
          margin: "0 auto",
        }}>
          All analyses are performed by independent, accredited laboratories.
          Certificates of Analysis are available for every lot produced. Results shown reflect
          the most recent production lot for each compound.
        </div>
      </div>
    </div>
  );
}

// ─── Age Verification Gate ────────────────────────────────────────────────────

function NotFoundPage() {
  usePageMeta("Page Not Found", "The page you're looking for doesn't exist.");
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
  usePageMeta("Shipping Policy", "How Tier One BioSystems ships research peptides — domestic shipping rates, processing time, free shipping over $200.");
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
  usePageMeta("Returns Policy", "Tier One BioSystems returns and refunds policy for research peptides.");
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
  usePageMeta("Terms of Service", "Terms of service for Tier One BioSystems research peptide supply.");
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
  usePageMeta("Privacy Policy", "How Tier One BioSystems collects and handles personal data.");
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
  usePageMeta("About", "Tier One BioSystems — research-grade peptides with lot-level transparency, 99%+ purity, and US-based fulfillment.");
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
  usePageMeta("FAQ", "Frequently asked questions about Tier One BioSystems research peptide products, ordering, shipping, and quality.");
  const [openIdx, setOpenIdx] = useState(null);
  const items = [
    { q: "Are your products for human use?", a: "No. All Tier One BioSystems products are sold strictly for in-vitro laboratory research use only. They are not drugs, supplements, food, or cosmetics. They are not intended for human or animal consumption." },
    { q: "What is your purity standard?", a: "Released lots meet or exceed 99% purity by reverse-phase HPLC. Each lot is tested for appearance, purity, peptide content, mass confirmation (ESI-MS or MALDI-TOF), water content, residual solvents, and bacterial endotoxins. Results are published on the Lab Results page." },
    { q: "How do I view a Certificate of Analysis (COA)?", a: "Every product page has a green VIEW CERTIFICATE OF ANALYSIS button. Clicking it opens that product's most recent lot data with all test results, methods, specifications, and pass/fail status." },
    { q: "How long does shipping take?", a: "Orders paid before 2:00 PM Arizona time ship the same business day from Phoenix, AZ via UPS or FedEx. Standard ground delivery within the continental US is typically 2–5 business days." },
    { q: "Do you offer free shipping?", a: "Yes. Orders of $200 or more (after any discounts applied) ship free. Orders under $200 are charged a flat $10 shipping fee." },
    { q: "What payment methods do you accept?", a: "Currently Cash App ($TierOneBio) and Venmo (@TierOneBio). At checkout you'll select your preferred method and follow the on-screen instructions to complete payment." },
    { q: "Why don't you accept credit cards?", a: "Most major card processors restrict research peptide sales due to category-level policy. Cash App and Venmo allow us to keep the catalog accessible and prices low without surprise account terminations or held funds." },
    { q: "How should I store the products?", a: "Lyophilized vials should be stored in a standard home freezer (0°F / -18°C) for long-term storage. Once reconstituted with bacteriostatic water, store refrigerated (35–46°F / 2–8°C) and use within the storage window listed on the product page." },
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
  usePageMeta("Testing Standards", "How Tier One BioSystems verifies research peptide purity, identity, and safety. HPLC, ESI-MS, AAA, peptide content, and endotoxin testing explained.");
  return (
    <>
      <PolicyShell kicker="QUALITY ASSURANCE" title="Testing Standards">
        <p>Every lot Tier One BioSystems releases is independently tested against a defined acceptance specification. Below is what we test, why we test it, and the methods used. The current Certificate of Analysis for each product is published on the <a onClick={(e) => { e.preventDefault(); window.location.href = "/lab-results"; }} style={{ color: "var(--red-primary)", cursor: "pointer" }}>Lab Results</a> page.</p>

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

function AgeGate({ onConfirm }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "rgba(0,0,0,0.95)",
      backdropFilter: "blur(20px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        maxWidth: 520,
        width: "100%",
        background: "var(--bg-card)",
        border: "1px solid rgba(196,30,42,0.3)",
        padding: "48px 36px",
        textAlign: "center",
        animation: "fadeIn 0.4s ease-out",
      }}>
        {/* Logo */}
        <img
          src="/logo_transparent.png"
          alt="Tier One BioSystems"
          style={{
            height: 120,
            width: "auto",
            marginBottom: 28,
          }}
        />

        {/* Divider */}
        <div style={{
          height: 1,
          background: "linear-gradient(to right, transparent, rgba(196,30,42,0.3), transparent)",
          marginBottom: 28,
        }} />

        {/* Age verification */}
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.05em",
          marginBottom: 16,
          color: "var(--text-primary)",
        }}>AGE VERIFICATION</h2>

        <p style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: 17,
          fontWeight: 500,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          marginBottom: 28,
        }}>
          You must be <span style={{ color: "var(--red-primary)", fontWeight: 700 }}>18 years or older</span> to
          access this website.
        </p>

        {/* Disclaimer box */}
        <div style={{
          padding: "18px 20px",
          border: "1px solid rgba(196,30,42,0.15)",
          background: "rgba(196,30,42,0.03)",
          marginBottom: 32,
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
            fontSize: 15,
            color: "var(--text-secondary)",
            lineHeight: 1.7,
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
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => onConfirm(true)}
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.15em",
              padding: "14px 36px",
              background: "var(--red-primary)",
              border: "1px solid var(--red-primary)",
              color: "#fff",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.2s",
              flex: 1,
              minWidth: 180,
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
              padding: "14px 36px",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.2s",
              flex: 1,
              minWidth: 180,
            }}
          >I AM UNDER 18</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [ageVerified, setAgeVerified] = useState(() => sessionStorage.getItem("ageVerified") === "true");
  const [ageDenied, setAgeDenied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const navigate = useNavigate();
  const [cart, setCart] = useState(() => {
    try { const saved = localStorage.getItem("t1b-cart"); return saved ? JSON.parse(saved) : []; }
    catch { return []; }
  });
  useEffect(() => { localStorage.setItem("t1b-cart", JSON.stringify(cart)); }, [cart]);
  const [cartPopupVisible, setCartPopupVisible] = useState(false);
  const cartPopupTimer = useRef(null);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);
  useEffect(() => () => { if (cartPopupTimer.current) clearTimeout(cartPopupTimer.current); }, []);

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    setCartPopupVisible(true);
    if (cartPopupTimer.current) clearTimeout(cartPopupTimer.current);
    cartPopupTimer.current = setTimeout(() => setCartPopupVisible(false), 4000);
  }

  useEffect(() => {
    const DOMAIN = "https://www.tierone.bio";
    const jsonld = {
      "@context": "https://schema.org",
      "@graph": PRODUCTS.map(p => ({
        "@type": "Product",
        "@id": `${DOMAIN}/product/${p.id}`,
        "name": `${p.name} ${p.dose}`,
        "description": p.research,
        "sku": p.id,
        "mpn": p.id,
        "brand": { "@type": "Brand", "name": "Tier One Bio" },
        "image": [`${DOMAIN}/${p.id}.jpg`, `${DOMAIN}/logo.png`],
        "url": `${DOMAIN}/product/${p.id}`,
        "offers": {
          "@type": "Offer",
          "url": `${DOMAIN}/product/${p.id}`,
          "price": p.price,
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "priceValidUntil": "2027-12-31",
          "seller": { "@type": "Organization", "name": "Tier One Bio" }
        }
      }))
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-tier1-products", "true");
    script.textContent = JSON.stringify(jsonld);
    document.head.appendChild(script);
    return () => {
      document.querySelectorAll('script[data-tier1-products]').forEach(el => el.remove());
    };
  }, []);

  const filtered = PRODUCTS.filter(p => {
    return searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

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

  // Age verification gate
  if (!ageVerified) {
    return (
      <AgeGate onConfirm={(isOldEnough) => {
        if (isOldEnough) {
          sessionStorage.setItem("ageVerified", "true");
          setAgeVerified(true);
        } else {
          setAgeDenied(true);
        }
      }} />
    );
  }

  // Home page content as a component
  // Featured product IDs
  const FEATURED_IDS = ["glp3rt-10", "tesamorelin", "bpc157-10", "tb500", "klow", "motsc"];
  const featuredProducts = FEATURED_IDS.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);

  const HomePage = () => {
    usePageMeta(null, "Premium research grade peptides with 99%+ purity. Third-party tested. BPC-157, GLP-3RT, Tesamorelin, and more. US-based supplier.");
    useScrollReveal();
    return (<>
      <Hero />

      {/* Featured Products */}
      <section className="scroll-reveal" style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
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

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 45%), 1fr))",
          gap: 20,
        }}>
          {featuredProducts.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              onClick={() => setSelectedProduct(product)}
              onAddToCart={addToCart}
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
  const ProductsPage = () => {
    usePageMeta("All Products", "Browse our full catalog of research grade peptides. 99%+ purity, third-party tested.");
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
              onClick={() => setSelectedProduct(product)}
              onAddToCart={addToCart}
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
  const ProductPage = () => {
    const { id } = useParams();
    const product = PRODUCTS.find(p => p.id === id);
    usePageMeta(
      product ? `${product.name} ${product.dose}` : "Product Not Found",
      product ? `${product.name} ${product.dose} — ${product.research?.slice(0, 150)}` : ""
    );
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
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 28 }}>${product.price}</span>
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--text-secondary)" }}>/vial</span>
              </div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 18, color: "var(--red-primary)", fontWeight: 700 }}>5+ Vials: ${product.bulk} each</div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>10+ extra 5% off · 25+ extra 10% off</div>
            </div>

            <button onClick={() => addToCart(product)} style={{
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
        </div>

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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
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
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/calculator" element={<PeptideCalculator />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/lab-results" element={<LabResultsPage />} />
        <Route path="/cart" element={<CartPage cart={cart} setCart={setCart} />} />
        <Route path="/checkout" element={<Navigate to="/cart" replace />} />
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
  );
}
