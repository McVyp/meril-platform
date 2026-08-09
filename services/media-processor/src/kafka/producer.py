import os
import json
from confluent_kafka import Producer

_producer: Producer | None = None

def get_producer() -> Producer:
    global _producer
    if _producer is None:
        _producer = Producer({
            "bootstrap.servers": os.environ["CONFLUENT_BOOTSTRAP_SERVERS"],
            "security.protocol": "SASL_SSL",
            "sasl.mechanisms": "PLAIN",
            "sasl.username": os.environ["CONFLUENT_API_KEY"],
            "sasl.password": os.environ["CONFLUENT_API_SECRET"],
        })
    return _producer

def _delivery_report(err, msg):
    if err is not None:
        print(f"Kafka delivery failed: {err}")
    else:
        print(f"Kafka event delivered to {msg.topic()} [{msg.partition()}]")

async def emit_event(topic: str, payload: dict) -> None:
    producer = get_producer()
    producer.produce(
        topic,
        value=json.dumps(payload).encode("utf-8"),
        callback=_delivery_report,
    )
    undelivered = producer.flush(timeout=10)
    if undelivered > 0:
        raise RuntimeError(f"Kafka delivery incomplete: {undelivered} message(s) not sent")