# Evaluation results (24 queries, 2383 documents)

Relevance = the document's category matches the query's category.

## Ranked models

| Model | P@5 | P@10 | Recall@100 | MAP@100 | MRR |
|---|---|---|---|---|---|
| TF-IDF | 0.975 | 0.950 | 0.386 | 0.687 | 0.958 |
| BM25 | 0.975 | 0.975 | 0.403 | 0.735 | 0.979 |

## Boolean model (unranked, whole result set)

| Model | Set precision | Set recall | Avg results | Queries with 0 results |
|---|---|---|---|---|
| Boolean | 0.906 | 0.267 | 59.8 | 0 / 24 |
