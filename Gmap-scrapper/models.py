"""
Data model for a single business lead.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Lead:
    name: str = ""
    address: str = ""
    phone: str = ""
    website: str = ""
    email: str = ""
    rating: Optional[float] = None
    review_count: int = 0
    category: str = ""
    hours: str = ""
    price_range: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    google_maps_url: str = ""
    place_id: str = ""

    def to_dict(self) -> dict:
        return {
            "Name": self.name,
            "Category": self.category,
            "Phone": self.phone,
            "Email": self.email,
            "Website": self.website,
            "Address": self.address,
            "Rating": self.rating if self.rating else "",
            "Reviews": self.review_count,
            "Price Range": self.price_range,
            "Hours": self.hours,
            "Latitude": self.latitude if self.latitude else "",
            "Longitude": self.longitude if self.longitude else "",
            "Google Maps URL": self.google_maps_url,
            "Place ID": self.place_id,
        }
