// Renders one research article body.
//
// Kept as a separate default-exported component so site_1.jsx can pull it in
// with React.lazy() — that is what moves the article bodies out of the main
// bundle and into a chunk fetched only when an article is actually opened.

import { ARTICLE_CONTENT } from "./article-content.jsx";

export default function ArticleBody({ slug }) {
  const render = ARTICLE_CONTENT[slug];
  return render ? render() : null;
}
