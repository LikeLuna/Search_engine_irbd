from pyspark.sql import SparkSession

def test_spark_runs():
    spark = SparkSession.builder.master("local[*]").appName("hello").getOrCreate()
    df = spark.createDataFrame([("information",), ("retrieval",)], ["word"])
    assert df.count() == 2
    spark.stop()