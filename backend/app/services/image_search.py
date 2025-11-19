"""Image search service using Openverse API."""

import logging
from typing import List, Dict, Any
import httpx

logger = logging.getLogger("dots.image_search")


class ImageSearchService:
    """Service for searching educational images using Openverse API."""

    def __init__(self) -> None:
        self.base_url = "https://api.openverse.org/v1/images/"

    async def search_images(
        self, query: str, per_page: int = 3
    ) -> List[Dict[str, Any]]:
        """Search for educational images based on query."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.base_url,
                    params={
                        "q": query,
                        "page_size": per_page,
                        "license_type": "commercial",
                    },
                    timeout=5.0,
                )
                response.raise_for_status()
                data = response.json()

                # Extract image URLs and metadata
                images = []
                for result in data.get("results", [])[:per_page]:
                    images.append({
                        "url": result.get("url"),
                        "thumbnail": result.get("thumbnail"),
                        "title": result.get("title", ""),
                        "creator": result.get("creator", ""),
                        "license": result.get("license", ""),
                    })
                logger.info(
                    "Found %d images for query: %s",
                    len(images),
                    query[:50],
                )
                return images
        except Exception as e:
            logger.error("Image search failed: %s", e)
            return []
