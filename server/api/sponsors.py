from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.deps import get_db
from auth.dependencies import require_admin
from auth.models import UserContext
from db.models import Prisoner, Sponsor
from schemas.sponsor import SponsorCreate, SponsorOut

router = APIRouter(tags=["sponsors"])


def _sponsee_counts(db: Session) -> dict:
    rows = (
        db.query(Prisoner.sponsor_name, func.count(Prisoner.cpid))
        .filter(Prisoner.sponsor_name.isnot(None))
        .group_by(Prisoner.sponsor_name)
        .all()
    )
    return {name: count for name, count in rows}


@router.get("", response_model=List[SponsorOut])
def list_sponsors(
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    counts = _sponsee_counts(db)
    sponsors = db.query(Sponsor).order_by(Sponsor.name).all()
    out = []
    for s in sponsors:
        item = SponsorOut.model_validate(s)
        item.sponsee_count = counts.get(s.name, 0)
        out.append(item)
    return out


@router.post("", response_model=SponsorOut, status_code=status.HTTP_201_CREATED)
def create_sponsor(
    payload: SponsorCreate,
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    existing = db.query(Sponsor).filter(Sponsor.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A sponsor with this name already exists")

    sponsor = Sponsor(**payload.model_dump())
    db.add(sponsor)
    db.commit()
    db.refresh(sponsor)

    counts = _sponsee_counts(db)
    item = SponsorOut.model_validate(sponsor)
    item.sponsee_count = counts.get(sponsor.name, 0)
    return item


@router.put("/{sponsor_id}", response_model=SponsorOut)
def update_sponsor(
    sponsor_id: int,
    payload: SponsorCreate,
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    sponsor = db.query(Sponsor).filter(Sponsor.id == sponsor_id).first()
    if not sponsor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor not found")

    for field, value in payload.model_dump().items():
        setattr(sponsor, field, value)
    db.commit()
    db.refresh(sponsor)

    counts = _sponsee_counts(db)
    item = SponsorOut.model_validate(sponsor)
    item.sponsee_count = counts.get(sponsor.name, 0)
    return item


@router.delete("/{sponsor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sponsor(
    sponsor_id: int,
    db: Session = Depends(get_db),
    _admin: UserContext = Depends(require_admin),
):
    sponsor = db.query(Sponsor).filter(Sponsor.id == sponsor_id).first()
    if not sponsor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor not found")
    db.delete(sponsor)
    db.commit()
