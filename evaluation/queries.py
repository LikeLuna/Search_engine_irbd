"""24 test queries. 'relevant' lists the categories whose documents
count as relevant. 'bool' is the Boolean version of the same information need."""

QUERIES = [
    # machine learning
    {"q": "neural network training",
     "bool": "neural AND (training OR learning)", "relevant": ["machine learning"]},
    {"q": "supervised learning classification algorithm",
     "bool": "supervised AND (classification OR learning)", "relevant": ["machine learning"]},
    # databases
    {"q": "SQL query relational tables",
     "bool": "SQL AND (query OR table)", "relevant": ["databases"]},
    {"q": "database transaction isolation",
     "bool": "transaction AND database", "relevant": ["databases"]},
    # distributed computing
    {"q": "consensus fault tolerance distributed systems",
     "bool": "consensus AND (fault OR distributed)", "relevant": ["distributed computing"]},
    {"q": "cluster parallel computing grid",
     "bool": "cluster AND (parallel OR grid)", "relevant": ["distributed computing"]},
    # information retrieval
    {"q": "search engine ranking documents",
     "bool": "retrieval AND (document OR search)", "relevant": ["information retrieval"]},
    {"q": "text retrieval query relevance",
     "bool": "relevance AND (query OR retrieval)", "relevant": ["information retrieval"]},
    # computer networks
    {"q": "internet routing protocol packets",
     "bool": "routing AND (protocol OR packet)", "relevant": ["computer networks"]},
    {"q": "wireless network standards",
     "bool": "wireless AND (network OR standard)", "relevant": ["computer networks"]},
    # astronomy
    {"q": "planets orbiting stars",
     "bool": "planet AND (star OR orbit)", "relevant": ["astronomy"]},
    {"q": "galaxy telescope observation",
     "bool": "galaxy AND (telescope OR observation)", "relevant": ["astronomy"]},
    # biology
    {"q": "DNA gene cell evolution",
     "bool": "DNA AND (gene OR cell)", "relevant": ["biology"]},
    {"q": "species organisms ecosystem",
     "bool": "species AND (organism OR ecosystem)", "relevant": ["biology"]},
    # indian history
    {"q": "Mughal empire British colonial rule",
     "bool": "(Mughal OR British) AND empire", "relevant": ["indian history"]},
    {"q": "ancient kingdom dynasty India",
     "bool": "ancient AND (kingdom OR dynasty)", "relevant": ["indian history"]},
    # physics
    {"q": "quantum particle wave energy",
     "bool": "quantum AND (particle OR wave)", "relevant": ["physics"]},
    {"q": "relativity gravity force",
     "bool": "relativity OR (gravity AND force)", "relevant": ["physics"]},
    # economics
    {"q": "inflation interest rates trade",
     "bool": "inflation AND (interest OR trade)", "relevant": ["economics"]},
    {"q": "stock market investors prices",
     "bool": "market AND (price OR investor)", "relevant": ["economics"]},
    # sports
    {"q": "cricket football tournament players",
     "bool": "cricket OR football", "relevant": ["sports"]},
    {"q": "team championship league match",
     "bool": "championship AND (team OR league)", "relevant": ["sports"]},
    # medicine
    {"q": "disease symptoms treatment drug",
     "bool": "disease AND (symptom OR treatment)", "relevant": ["medicine"]},
    {"q": "vaccine infection patients",
     "bool": "vaccine OR infection", "relevant": ["medicine"]},
]