"""Evaluation metrics. `ranked` is a list of doc ids, best first;
`relevant` is a set of doc ids."""


def precision_at_k(ranked, relevant, k):
    return sum(1 for d in ranked[:k] if d in relevant) / k


def recall_at_k(ranked, relevant, k):
    if not relevant:
        return 0.0
    return sum(1 for d in ranked[:k] if d in relevant) / len(relevant)


def average_precision(ranked, relevant, k=100):
    """AP over the top k, divided by min(#relevant, k) so a perfect
    ranking scores 1.0 even when there are more than k relevant docs."""
    hits, total = 0, 0.0
    for i, d in enumerate(ranked[:k], 1):
        if d in relevant:
            hits += 1
            total += hits / i
    denom = min(len(relevant), k)
    return total / denom if denom else 0.0


def reciprocal_rank(ranked, relevant):
    for i, d in enumerate(ranked, 1):
        if d in relevant:
            return 1.0 / i
    return 0.0


def set_precision_recall(retrieved, relevant):
    """For unranked (Boolean) results."""
    retrieved, relevant = set(retrieved), set(relevant)
    hits = len(retrieved & relevant)
    precision = hits / len(retrieved) if retrieved else 0.0
    recall = hits / len(relevant) if relevant else 0.0
    return precision, recall