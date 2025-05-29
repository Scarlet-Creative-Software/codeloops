#!/bin/bash

# Monitor the knowledge_graph.ndjson file size
LOG_FILE="/Users/matthewamann/codeloops/data/knowledge_graph.ndjson"

echo "Monitoring log file size: $LOG_FILE"
echo "Press Ctrl+C to stop"
echo ""

# Get initial size
INITIAL_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)
INITIAL_SIZE_MB=$(echo "scale=2; $INITIAL_SIZE / 1048576" | bc)

echo "Initial size: ${INITIAL_SIZE_MB} MB"
echo "------------------------"
echo "Time     | Size (MB) | Growth (MB)"
echo "------------------------"

while true; do
    CURRENT_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null)
    CURRENT_SIZE_MB=$(echo "scale=2; $CURRENT_SIZE / 1048576" | bc)
    GROWTH_MB=$(echo "scale=2; $CURRENT_SIZE_MB - $INITIAL_SIZE_MB" | bc)
    
    printf "%s | %8.2f | %+9.2f\n" "$(date +%H:%M:%S)" "$CURRENT_SIZE_MB" "$GROWTH_MB"
    
    sleep 2
done