#!/bin/bash
set -e

# Install dependencies
pip install pydantic pydantic-settings -t /package --quiet

# Copy to output
cp -r /package/* /output/
cp /src/*.py /output/

echo "Build complete"
