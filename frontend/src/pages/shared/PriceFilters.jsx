function PriceFilters({ values, onChange, onSubmit, onReset, busy }) {
  function update(event) {
    onChange({
      ...values,
      [event.target.name]: event.target.value,
    });
  }

  return (
    <form className="price-data-filters" onSubmit={onSubmit}>
      <label>
        <span>Commodity</span>
        <input
          name="commodity"
          value={values.commodity}
          onChange={update}
          placeholder="e.g. Tomato"
          autoComplete="off"
        />
      </label>
      <label className="price-data-filters__search">
        <span>Search records</span>
        <input
          name="search"
          value={values.search}
          onChange={update}
          placeholder="Search commodity, variety, market or location"
          autoComplete="off"
        />
      </label>
      <label>
        <span>State</span>
        <input
          name="state"
          value={values.state}
          onChange={update}
          placeholder="State"
          autoComplete="off"
        />
      </label>
      <label>
        <span>District</span>
        <input
          name="district"
          value={values.district}
          onChange={update}
          placeholder="District"
          autoComplete="off"
        />
      </label>
      <label>
        <span>Market</span>
        <input
          name="market"
          value={values.market}
          onChange={update}
          placeholder="Mandi"
          autoComplete="off"
        />
      </label>
      <label>
        <span>From date</span>
        <input
          type="date"
          name="fromDate"
          value={values.fromDate}
          onChange={update}
        />
      </label>
      <label>
        <span>To date</span>
        <input
          type="date"
          name="toDate"
          value={values.toDate}
          onChange={update}
        />
      </label>
      <div className="price-data-filters__actions">
        <button className="farmer-button farmer-button--primary" type="submit" disabled={busy}>
          Apply filters
        </button>
        <button className="farmer-button farmer-button--outline" type="button" onClick={onReset} disabled={busy}>
          Clear
        </button>
      </div>
    </form>
  );
}

export default PriceFilters;
